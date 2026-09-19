import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bell, Moon, Shield, LogOut, Lock, Crown, Ban, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AvatarBuilder } from '@/components/profile/AvatarBuilder';
import { useUserRole } from '@/hooks/useUserRole';
import { VipProMaxActivation } from '@/components/profile/VipProMaxActivation';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface BlockedUser {
  blocked_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Settings = () => {
  // Blocking APIs are newer than the generated client schema.
  const socialClient = supabase as any;
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { activateVIP, isVIP } = useUserRole();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [privateAccount, setPrivateAccount] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [vipCode, setVipCode] = useState('');
  const [activatingVIP, setActivatingVIP] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      setCurrentProfile(data);
    };
    fetchProfile();
  }, [user]);

  // Blokovaní se čtou ze dvou míst: seznam ID vidí jen jeho vlastník,
  // jména a avatary se doberou zvlášť z profilů.
  const fetchBlockedUsers = useCallback(async () => {
    if (!user) return;
    setLoadingBlocked(true);

    const { data: blocks } = await socialClient
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id);

    if (!blocks?.length) {
      setBlockedUsers([]);
      setLoadingBlocked(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .in('user_id', blocks.map((b: { blocked_id: string }) => b.blocked_id));

    setBlockedUsers(
      (profiles || []).map((p) => ({
        blocked_id: p.user_id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
      }))
    );
    setLoadingBlocked(false);
  }, [user]);

  useEffect(() => {
    void fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const unblockUser = async (blockedId: string) => {
    setUnblocking(blockedId);
    const { error } = await socialClient.rpc('unblock_user', { _user_id: blockedId });
    setUnblocking(null);

    if (error) {
      toast({
        title: 'Odblokování se nezdařilo',
        description: 'Zkus to prosím znovu.',
        variant: 'destructive',
      });
      return;
    }

    setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedId));
    toast({ title: 'Odblokováno', description: 'Uživatel ti zase může psát.' });
  };

  // Handle dark mode toggle
  const handleDarkModeChange = (enabled: boolean) => {
    setDarkMode(enabled);
    if (enabled) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Initialize dark mode from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    } else if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      setDarkMode(false);
    }
  }, []);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: 'Odhlášeno',
      description: 'Byl jsi úspěšně odhlášen.',
    });
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Chyba',
        description: 'Hesla se neshodují.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Chyba',
        description: 'Heslo musí mít alespoň 6 znaků.',
        variant: 'destructive',
      });
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se změnit heslo.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Úspěch',
        description: 'Heslo bylo změněno.',
      });
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPassword(false);
  };

  const handleActivateVIP = async () => {
    if (!vipCode.trim()) return;
    setActivatingVIP(true);
    await activateVIP(vipCode.trim());
    setActivatingVIP(false);
    setVipCode('');
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold">Nastavení</h1>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Oznámení
              </CardTitle>
              <CardDescription>Spravuj své preference oznámení</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="push-notifications">Push oznámení</Label>
                  <p className="text-sm text-muted-foreground">Dostávat oznámení na telefon</p>
                </div>
                <Switch
                  id="push-notifications"
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-notifications">E-mailová oznámení</Label>
                  <p className="text-sm text-muted-foreground">Dostávat oznámení na e-mail</p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>
            </CardContent>
          </Card>

          {/* Avatar Builder */}
          <AvatarBuilder />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="h-5 w-5" />
                Vzhled
              </CardTitle>
              <CardDescription>Přizpůsob si vzhled aplikace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode">Tmavý režim</Label>
                <Switch
                  id="dark-mode"
                  checked={darkMode}
                  onCheckedChange={handleDarkModeChange}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Soukromí
              </CardTitle>
              <CardDescription>Nastav si úroveň soukromí</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="private-account">Soukromý účet</Label>
                <Switch
                  id="private-account"
                  checked={privateAccount}
                  onCheckedChange={setPrivateAccount}
                />
              </div>
            </CardContent>
          </Card>

          {/* Blocked users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Zablokovaní
              </CardTitle>
              <CardDescription>
                Tihle ti nemůžou psát a neuvidíš jejich příspěvky. Můžeš je kdykoli odblokovat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBlocked ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : blockedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nikoho nemáš zablokovaného.
                </p>
              ) : (
                <ul className="space-y-3">
                  {blockedUsers.map((blocked) => (
                    <li key={blocked.blocked_id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={blocked.avatar_url || ''} />
                        <AvatarFallback>{blocked.full_name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{blocked.full_name}</p>
                        <p className="text-sm text-muted-foreground truncate">@{blocked.username}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unblocking === blocked.blocked_id}
                        onClick={() => void unblockUser(blocked.blocked_id)}
                      >
                        {unblocking === blocked.blocked_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Odblokovat'
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Password Change */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Změna hesla
              </CardTitle>
              <CardDescription>Aktualizuj své přístupové heslo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nové heslo</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Zadej nové heslo (min. 6 znaků)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Potvrzení hesla</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Zopakuj nové heslo"
                />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-destructive">Hesla se neshodují.</p>
              )}
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              >
                {changingPassword ? 'Měním heslo...' : 'Změnit heslo'}
              </Button>
            </CardContent>
          </Card>

          {/* VIP Activation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                VIP Aktivace
              </CardTitle>
              <CardDescription>Aktivuj VIP pomocí kódu — cena 30 Kč</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                <span className="font-bold text-yellow-600 dark:text-yellow-400">Cena VIP: 30 Kč</span>
                <p className="text-xs text-muted-foreground mt-1">Jednorázový kód získáš od tvůrce po zaplacení.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vip-code">VIP kód</Label>
                <Input
                  id="vip-code"
                  type="password"
                  value={vipCode}
                  onChange={(e) => setVipCode(e.target.value)}
                  placeholder="Zadej VIP kód..."
                />
              </div>
              <Button 
                onClick={handleActivateVIP} 
                disabled={activatingVIP || !vipCode.trim()}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
              >
                {activatingVIP ? 'Aktivuji...' : 'Aktivovat VIP'}
              </Button>
            </CardContent>
          </Card>

          {/* VIP PRO MAX Activation */}
          <VipProMaxActivation />


          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <LogOut className="h-5 w-5" />
                Odhlášení
              </CardTitle>
              <CardDescription>Odhlásit se z účtu</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Odhlásit se
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Settings;
