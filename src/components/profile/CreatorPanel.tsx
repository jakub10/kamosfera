import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2, Trash2, Ban, Eye, AlertTriangle, UserX, RefreshCw, Bot, ExternalLink, Flag, Crown, Gem, Copy, KeyRound, Search, UserCog } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import mascotThumbsup from '@/assets/mascot-thumbsup.png';
import mascotLock from '@/assets/mascot-lock.png';

interface BannedUser {
  id: string;
  user_id: string;
  reason: string | null;
  banned_at: string;
}

interface FlaggedNotification {
  id: string;
  post_id: string | null;
  message: string | null;
  created_at: string;
  read: boolean;
}

interface ActivationCode {
  id: string;
  code: string;
  role: 'vip' | 'vip_pro_max';
  created_at: string;
}

/** Z neznámé chyby vytáhne text, který jde ukázat uživateli. */
function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function CreatorPanel() {
  const { isCreator, activateCreator, loading } = useUserRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [activating, setActivating] = useState(false);
  const [userIdToBan, setUserIdToBan] = useState('');
  const [banReason, setBanReason] = useState('');
  const [postIdToDelete, setPostIdToDelete] = useState('');
  const [postIdToView, setPostIdToView] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [flaggedPosts, setFlaggedPosts] = useState<FlaggedNotification[]>([]);
  const [loadingBanned, setLoadingBanned] = useState(false);
  const [loadingFlagged, setLoadingFlagged] = useState(false);
  const [runningModeration, setRunningModeration] = useState(false);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [generatingRole, setGeneratingRole] = useState<'vip' | 'vip_pro_max' | null>(null);
  const [roleSearch, setRoleSearch] = useState('');
  const [roleResults, setRoleResults] = useState<Array<{ user_id: string; username: string; full_name: string; avatar_url: string | null; roles: string[] }>>([]);
  const [searchingRoles, setSearchingRoles] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);

  const searchUsersForRoles = async () => {
    if (!isCreator) return;
    setSearchingRoles(true);
    try {
      const term = roleSearch.trim();
      let query = supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .order('created_at', { ascending: false })
        .limit(30);
      if (term) {
        query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
      }
      const { data: profs, error } = await query;
      if (error || !profs) {
        setRoleResults([]);
        return;
      }
      const ids = profs.map((p) => p.user_id);
      const { data: rolesRows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', ids);
      const byUser: Record<string, string[]> = {};
      (rolesRows || []).forEach((r) => {
        byUser[r.user_id] = [...(byUser[r.user_id] || []), r.role];
      });
      setRoleResults(profs.map((p) => ({ ...p, roles: byUser[p.user_id] || [] })));
    } finally {
      setSearchingRoles(false);
    }
  };

  const setUserRole = async (target_user_id: string, role: 'vip' | 'vip_pro_max' | 'creator', action: 'grant' | 'revoke') => {
    setUpdatingRoleFor(target_user_id + role + action);
    const { data, error } = await supabase.functions.invoke('admin-set-role', {
      body: { target_user_id, role, action },
    });
    setUpdatingRoleFor(null);
    if (error || !data?.success) {
      toast({
        title: 'Chyba',
        description: (data as { error?: string } | null)?.error || error?.message || 'Nepodařilo se změnit roli.',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: action === 'grant' ? '✅ Role přiřazena' : '🗑️ Role odebrána',
      description: role === 'vip_pro_max' ? 'VIP PRO MAX' : role === 'creator' ? 'Tvůrce' : 'VIP',
    });
    await searchUsersForRoles();
  };

  const fetchBannedUsers = async () => {
    if (!isCreator) return;
    setLoadingBanned(true);
    const { data, error } = await supabase
      .from('banned_users')
      .select('*')
      .order('banned_at', { ascending: false });
    
    if (!error && data) {
      setBannedUsers(data);
    }
    setLoadingBanned(false);
  };

  const fetchFlaggedPosts = async () => {
    if (!isCreator || !user) return;
    setLoadingFlagged(true);
    
    const { data, error } = await supabase
      .from('notifications')
      .select('id, post_id, message, created_at, read')
      .eq('user_id', user.id)
      .eq('type', 'moderation')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      setFlaggedPosts(data);
    }
    setLoadingFlagged(false);
  };

  const fetchCodes = async () => {
    if (!isCreator) return;
    setLoadingCodes(true);
    const { data, error } = await supabase
      .from('activation_codes')
      .select('id, code, role, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setCodes(data as ActivationCode[]);
    setLoadingCodes(false);
  };

  const generateCode = async (role: 'vip' | 'vip_pro_max') => {
    setGeneratingRole(role);
    const { data, error } = await supabase.rpc('create_activation_code', { _role: role });
    setGeneratingRole(null);
    if (error) {
      toast({ title: 'Chyba', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: role === 'vip' ? '🌟 VIP kód vytvořen' : '💎 VIP PRO MAX kód vytvořen',
      description: `Kód: ${data}`,
    });
    await fetchCodes();
    // Schránka může být zakázaná (jiná záložka, starší prohlížeč).
    // Kód je vidět v toastu výše, takže na selhání kopírování nezáleží.
    try {
      await navigator.clipboard.writeText(data as string);
    } catch {
      /* kopírování není povinné */
    }
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from('activation_codes').delete().eq('id', id);
    if (error) {
      toast({ title: 'Chyba', description: error.message, variant: 'destructive' });
      return;
    }
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: '📋 Zkopírováno', description: code });
    } catch {
      /* schránka může být zakázaná — kód je vidět na obrazovce */
    }
  };

  useEffect(() => {
    if (isCreator) {
      fetchBannedUsers();
      fetchFlaggedPosts();
      fetchCodes();
      searchUsersForRoles();
    }
  }, [isCreator, user]);


  const handleActivate = async () => {
    if (!password.trim()) return;
    setActivating(true);
    const success = await activateCreator(password.trim());
    setActivating(false);
    if (success) {
      setShowPasswordDialog(false);
    }
    setPassword('');
  };

  const runAIModeration = async () => {
    setRunningModeration(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Musíš se přihlásit.');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-moderation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Moderation failed');
      }

      toast({
        title: '🤖 AI Moderace dokončena',
        description: `Analyzováno ${result.analyzed_count} příspěvků, nalezeno ${result.flagged?.length || 0} problémových.`,
      });

      // Refresh flagged posts
      await fetchFlaggedPosts();
    } catch (error: unknown) {
      toast({
        title: 'Chyba',
        description: errorMessage(error) || 'Nepodařilo se spustit moderaci.',
        variant: 'destructive',
      });
    } finally {
      setRunningModeration(false);
    }
  };

  const deletePost = async (postId?: string) => {
    const idToDelete = postId || postIdToDelete.trim();
    if (!idToDelete || !isCreator) return;
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', idToDelete);

      if (error) throw error;

      toast({
        title: '🗑️ Příspěvek smazán',
        description: 'Příspěvek byl úspěšně odstraněn.',
      });
      setPostIdToDelete('');
      
      // Remove from flagged list if present
      setFlaggedPosts(prev => prev.filter(fp => fp.post_id !== idToDelete));
    } catch (error: unknown) {
      toast({
        title: 'Chyba',
        description: errorMessage(error) || 'Nepodařilo se smazat příspěvek.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const dismissFlaggedPost = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    
    setFlaggedPosts(prev => prev.filter(fp => fp.id !== notificationId));
    
    toast({
      title: '✓ Označeno jako vyřešené',
      description: 'Upozornění bylo odstraněno.',
    });
  };

  const banUser = async () => {
    if (!userIdToBan.trim() || !isCreator) return;
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from('banned_users')
        .upsert({
          user_id: userIdToBan.trim(),
          banned_by: user?.id,
          reason: banReason.trim() || null,
        });

      if (error) throw error;

      toast({
        title: '🚫 Uživatel zablokován',
        description: 'Uživatel byl přidán na seznam zablokovaných.',
      });
      setUserIdToBan('');
      setBanReason('');
      fetchBannedUsers();
    } catch (error: unknown) {
      toast({
        title: 'Chyba',
        description: errorMessage(error) || 'Nepodařilo se zablokovat uživatele.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const unbanUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('banned_users')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: '✅ Uživatel odblokován',
        description: 'Uživatel byl odebrán ze seznamu zablokovaných.',
      });
      fetchBannedUsers();
    } catch (error: unknown) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odblokovat uživatele.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return null;
  }

  // Hidden button for non-creators - positioned at bottom of profile page
  if (!isCreator) {
    return (
      <>
        <div className="flex justify-end mt-8">
          <button
            onClick={() => setShowPasswordDialog(true)}
            className="w-12 h-12 opacity-0 hover:opacity-5 transition-opacity"
            aria-hidden="true"
          />
        </div>
        
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Přístup tvůrce
              </DialogTitle>
              <DialogDescription>
                Zadejte heslo pro získání oprávnění tvůrce
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Heslo tvůrce..."
                type="password"
                onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
              />
              <Button 
                onClick={handleActivate} 
                disabled={!password.trim() || activating}
                className="w-full"
              >
                {activating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Potvrdit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="border-purple-500/50 bg-gradient-to-br from-purple-500/5 to-pink-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-500" />
          Panel tvůrce
        </CardTitle>
        <CardDescription>
          Administrátorské nástroje pro správu sítě
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="moderation" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="moderation" className="gap-1">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI Moderace</span>
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-1">
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Příspěvky</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1">
              <Ban className="h-4 w-4" />
              <span className="hidden sm:inline">Uživatelé</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1">
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Role</span>
            </TabsTrigger>
            <TabsTrigger value="codes" className="gap-1">
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Kódy</span>
            </TabsTrigger>
          </TabsList>

          {/* AI Moderation Tab */}
          <TabsContent value="moderation" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  AI Kontrola obsahu
                </h4>
                <p className="text-sm text-muted-foreground">
                  Automatická kontrola nevhodného obsahu
                </p>
              </div>
              <Button 
                onClick={runAIModeration}
                disabled={runningModeration}
                variant="outline"
                className="gap-2"
              >
                {runningModeration ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                Spustit kontrolu
              </Button>
            </div>

            {/* Flagged Posts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Flag className="h-4 w-4 text-red-500" />
                  Nahlášené příspěvky ({flaggedPosts.length})
                </label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchFlaggedPosts}
                  disabled={loadingFlagged}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingFlagged ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              {flaggedPosts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground flex flex-col items-center gap-2">
                  <img src={mascotThumbsup} alt="" className="w-24 h-24 object-contain" loading="lazy" />
                  <p className="text-sm">Žádné nahlášené příspěvky</p>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {flaggedPosts.map((fp) => (
                    <div key={fp.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fp.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Post ID: <code className="bg-muted px-1 rounded">{fp.post_id?.slice(0, 8)}...</code>
                          </p>
                        </div>
                        <Badge variant="destructive" className="text-xs shrink-0">
                          AI
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setPostIdToView(fp.post_id || '')}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Zobrazit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => deletePost(fp.post_id || '')}
                          disabled={deleting}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Smazat
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismissFlaggedPost(fp.id)}
                        >
                          ✓
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* View Post by ID */}
            <div className="space-y-2 pt-4 border-t border-border">
              <label className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                Zobrazit příspěvek podle ID
              </label>
              <div className="flex gap-2">
                <Input
                  value={postIdToView}
                  onChange={(e) => setPostIdToView(e.target.value)}
                  placeholder="ID příspěvku..."
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  asChild
                  disabled={!postIdToView.trim()}
                >
                  <Link to={`/post/${postIdToView}`} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                Smazat příspěvek podle ID
              </label>
              <div className="flex gap-2">
                <Input
                  value={postIdToDelete}
                  onChange={(e) => setPostIdToDelete(e.target.value)}
                  placeholder="ID příspěvku..."
                  className="flex-1"
                />
                <Button 
                  variant="destructive" 
                  onClick={() => deletePost()}
                  disabled={!postIdToDelete.trim() || deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ID příspěvku najdeš v URL nebo v nahlášených příspěvcích
              </p>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            {/* Ban User */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Ban className="h-4 w-4 text-orange-500" />
                Blokovat uživatele
              </label>
              <div className="flex flex-col gap-2">
                <Input
                  value={userIdToBan}
                  onChange={(e) => setUserIdToBan(e.target.value)}
                  placeholder="ID uživatele..."
                />
                <Input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Důvod (volitelné)..."
                />
                <Button 
                  variant="outline" 
                  className="border-orange-500 text-orange-500 hover:bg-orange-500/10"
                  onClick={banUser}
                  disabled={!userIdToBan.trim() || deleting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                  Zablokovat
                </Button>
              </div>
            </div>

            {/* Banned Users List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <UserX className="h-4 w-4 text-red-500" />
                  Zablokovaní uživatelé ({bannedUsers.length})
                </label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchBannedUsers}
                  disabled={loadingBanned}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingBanned ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {bannedUsers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <img src={mascotLock} alt="" className="w-24 h-24 object-contain" loading="lazy" />
                  <p className="text-sm text-muted-foreground text-center">
                    Žádní zablokovaní uživatelé
                  </p>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {bannedUsers.map((banned) => (
                    <div key={banned.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-2 text-sm">
                      <div className="flex-1 truncate">
                        <span className="font-mono text-xs">{banned.user_id.slice(0, 8)}...</span>
                        {banned.reason && (
                          <span className="text-muted-foreground ml-2">({banned.reason})</span>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => unbanUser(banned.user_id)}
                        className="text-green-500 hover:text-green-400 hover:bg-green-500/10"
                      >
                        Odblokovat
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Search className="h-4 w-4 text-purple-500" />
                Hledat uživatele (jméno nebo přezdívka)
              </label>
              <div className="flex gap-2">
                <Input
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Zadej jméno..."
                  onKeyDown={(e) => e.key === 'Enter' && searchUsersForRoles()}
                />
                <Button onClick={searchUsersForRoles} disabled={searchingRoles} variant="outline">
                  {searchingRoles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Klikni na uživatele a přiděl nebo odeber VIP / VIP PRO MAX.
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {roleResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Žádní uživatelé</p>
              ) : (
                roleResults.map((u) => {
                  const isVip = u.roles.includes('vip');
                  const isMax = u.roles.includes('vip_pro_max');
                  const isCreatorUser = u.roles.includes('creator');
                  const busyKey = (r: string, a: string) => u.user_id + r + a;
                  return (
                    <div key={u.user_id} className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.avatar_url || undefined} />
                          <AvatarFallback>{(u.username || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.full_name || u.username}</p>
                          <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {isCreatorUser && <Badge className="bg-purple-500 text-white text-xs">Tvůrce</Badge>}
                            {isMax && <Badge className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white text-xs">PRO MAX</Badge>}
                            {isVip && !isMax && <Badge className="bg-yellow-500 text-white text-xs">VIP</Badge>}
                            {!isVip && !isMax && !isCreatorUser && <Badge variant="outline" className="text-xs">Uživatel</Badge>}
                          </div>
                        </div>
                      </div>
                      {u.user_id === user?.id ? (
                        <p className="text-xs text-muted-foreground italic">Sebe sama nemůžeš upravovat.</p>
                      ) : isCreatorUser ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUserRole(u.user_id, 'creator', 'revoke')}
                          disabled={updatingRoleFor === busyKey('creator', 'revoke')}
                          className="w-full border-purple-500 text-purple-600"
                        >
                          {updatingRoleFor === busyKey('creator', 'revoke') ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Shield className="h-3 w-3 mr-1" />
                          )}
                          Odebrat Tvůrce
                        </Button>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {isVip && !isMax ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setUserRole(u.user_id, 'vip', 'revoke')}
                              disabled={updatingRoleFor === busyKey('vip', 'revoke')}
                              className="border-yellow-500 text-yellow-600"
                            >
                              {updatingRoleFor === busyKey('vip', 'revoke') ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Crown className="h-3 w-3 mr-1" />
                              )}
                              Odebrat VIP
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setUserRole(u.user_id, 'vip', 'grant')}
                              disabled={isVip || updatingRoleFor === busyKey('vip', 'grant')}
                              className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white"
                            >
                              {updatingRoleFor === busyKey('vip', 'grant') ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Crown className="h-3 w-3 mr-1" />
                              )}
                              Dát VIP
                            </Button>
                          )}
                          {isMax ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setUserRole(u.user_id, 'vip_pro_max', 'revoke')}
                              disabled={updatingRoleFor === busyKey('vip_pro_max', 'revoke')}
                              className="border-fuchsia-500 text-fuchsia-600"
                            >
                              {updatingRoleFor === busyKey('vip_pro_max', 'revoke') ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Gem className="h-3 w-3 mr-1" />
                              )}
                              Odebrat PRO MAX
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setUserRole(u.user_id, 'vip_pro_max', 'grant')}
                              disabled={updatingRoleFor === busyKey('vip_pro_max', 'grant')}
                              className="bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 text-white"
                            >
                              {updatingRoleFor === busyKey('vip_pro_max', 'grant') ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Gem className="h-3 w-3 mr-1" />
                              )}
                              Dát PRO MAX
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUserRole(u.user_id, 'creator', 'grant')}
                            disabled={updatingRoleFor === busyKey('creator', 'grant')}
                            className="col-span-2 border-purple-500 text-purple-600 hover:bg-purple-500/10"
                          >
                            {updatingRoleFor === busyKey('creator', 'grant') ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Shield className="h-3 w-3 mr-1" />
                            )}
                            Udělat Tvůrcem
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Codes Tab */}
          <TabsContent value="codes" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={() => generateCode('vip')}
                disabled={generatingRole !== null}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:opacity-90 text-white"
              >
                {generatingRole === 'vip' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Crown className="h-4 w-4 mr-2" />
                )}
                Vytvořit VIP kód (30 Kč)
              </Button>
              <Button
                onClick={() => generateCode('vip_pro_max')}
                disabled={generatingRole !== null}
                className="bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 hover:opacity-90 text-white"
              >
                {generatingRole === 'vip_pro_max' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Gem className="h-4 w-4 mr-2" />
                )}
                Vytvořit PRO MAX kód (50 Kč)
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-purple-500" />
                  Aktivní kódy ({codes.length})
                </label>
                <Button variant="ghost" size="sm" onClick={fetchCodes} disabled={loadingCodes}>
                  <RefreshCw className={`h-4 w-4 ${loadingCodes ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {codes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Zatím nejsou žádné aktivní kódy. Kód se po použití automaticky smaže.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {codes.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {c.role === 'vip_pro_max' ? (
                            <Gem className="h-3.5 w-3.5 text-fuchsia-500 shrink-0" />
                          ) : (
                            <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          )}
                          <code className="text-sm font-mono truncate">{c.code}</code>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.role === 'vip_pro_max' ? 'VIP PRO MAX · 50 Kč' : 'VIP · 30 Kč'}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => copyCode(c.code)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCode(c.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Každý kód lze použít pouze jednou. Po aktivaci se automaticky odstraní ze systému.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Stats */}
        <div className="pt-4 mt-4 border-t border-border">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Přehled
          </h4>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xl font-bold text-purple-500">∞</p>
              <p className="text-xs text-muted-foreground">Oprávnění</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xl font-bold text-red-500">{bannedUsers.length}</p>
              <p className="text-xs text-muted-foreground">Blokovaných</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xl font-bold text-orange-500">{flaggedPosts.length}</p>
              <p className="text-xs text-muted-foreground">Nahlášených</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 mt-4 bg-yellow-500/10 rounded-lg text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <span className="text-muted-foreground">
            Používejte tyto nástroje zodpovědně. Všechny akce jsou zaznamenávány.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
