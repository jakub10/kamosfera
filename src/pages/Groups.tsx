import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, MessageCircle, Send, Lock, Globe, LogOut, Settings, UserPlus, UserMinus, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import mascotFriends from '@/assets/mascot-friends.png';
import mascotWelcome from '@/assets/mascot-welcome.png';
import mascotChat from '@/assets/mascot-chat.png';
import { cn } from '@/lib/utils';
import { GROUP_COLORS, GROUP_EMOJIS, groupStyle, type GroupColor } from '@/lib/groupStyle';

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  is_private: boolean;
  created_at: string;
  emoji?: string;
  color?: string;
  member_count?: number;
  is_member?: boolean;
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  profile?: Profile;
}

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profile?: Profile;
}

interface PendingRequest {
  user_id: string;
  profile?: Profile;
}

const Groups = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState(GROUP_EMOJIS[1]);
  const [newGroupColor, setNewGroupColor] = useState<GroupColor>('sky');
  const [newGroupPrivate, setNewGroupPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [searchUsers, setSearchUsers] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCurrentProfile();
      fetchGroups();
    }
  }, [user]);

  useEffect(() => {
    if (selectedGroup && user) {
      fetchMessages(selectedGroup.id);
      
      const channel = supabase
        .channel(`group-${selectedGroup.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${selectedGroup.id}`,
          },
          async (payload) => {
            const newMsg = payload.new as GroupMessage;
            const { data: profile } = await supabase
              .from('profiles')
              .select('user_id, username, full_name, avatar_url')
              .eq('user_id', newMsg.sender_id)
              .maybeSingle();
            
            setMessages(prev => [...prev, { ...newMsg, profile: profile || undefined }]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedGroup, user]);

  const fetchCurrentProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    setCurrentProfile(data);
  };

  const fetchGroups = async () => {
    if (!user) return;
    
    const { data: groupsData, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching groups:', error);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    const membershipSet = new Set(memberships?.map(m => m.group_id) || []);

    const groupsWithData = await Promise.all(
      (groupsData || []).map(async (group) => {
        const { count } = await supabase
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);

        return {
          ...group,
          member_count: count || 0,
          is_member: membershipSet.has(group.id) || group.owner_id === user.id,
        };
      })
    );

    setGroups(groupsWithData);
    setLoading(false);
  };

  const fetchMessages = async (groupId: string) => {
    const { data } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (data) {
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', senderIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setMessages(
        data.map(msg => ({
          ...msg,
          profile: profileMap.get(msg.sender_id) || undefined,
        }))
      );
    }
  };

  const fetchGroupMembers = async (groupId: string) => {
    const { data } = await supabase
      .from('group_members')
      .select('id, user_id, role')
      .eq('group_id', groupId);

    if (data) {
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setGroupMembers(
        data.map(member => ({
          ...member,
          profile: profileMap.get(member.user_id) || undefined,
        }))
      );
    }
  };

  const searchForUsers = async (query: string) => {
    if (!query.trim() || !selectedGroup) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(10);

    // Filter out existing members
    const memberIds = new Set(groupMembers.map(m => m.user_id));
    setSearchResults((data || []).filter(p => !memberIds.has(p.user_id)));
    setSearching(false);
  };

  const addMember = async (userId: string) => {
    if (!selectedGroup) return;

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: selectedGroup.id, user_id: userId, role: 'member' });

    if (!error) {
      toast({ title: 'Člen přidán', description: 'Uživatel byl přidán do skupiny.' });
      fetchGroupMembers(selectedGroup.id);
      setSearchResults([]);
      setSearchUsers('');
      fetchGroups();
    }
  };

  const removeMember = async (userId: string) => {
    if (!selectedGroup) return;

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', selectedGroup.id)
      .eq('user_id', userId);

    if (!error) {
      toast({ title: 'Člen odebrán', description: 'Uživatel byl odebrán ze skupiny.' });
      fetchGroupMembers(selectedGroup.id);
      fetchGroups();
    }
  };

  const createGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    setCreating(true);

    const base = {
      name: newGroupName.trim(),
      description: newGroupDescription.trim() || null,
      owner_id: user.id,
      is_private: newGroupPrivate,
    };
    let { data: group, error } = await supabase
      .from('groups')
      .insert({ ...base, emoji: newGroupEmoji, color: newGroupColor })
      .select()
      .single();
    // Dokud v databázi neběží migrace s ikonou a barvou, založí se skupina bez nich.
    if (error && /emoji|color/i.test(error.message)) {
      ({ data: group, error } = await supabase.from('groups').insert(base).select().single());
    }

    if (error || !group) {
      toast({ title: 'Chyba', description: 'Nepodařilo se vytvořit skupinu.', variant: 'destructive' });
    } else {
      await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'owner' });

      toast({ title: 'Skupina vytvořena!', description: `Skupina "${group.name}" byla úspěšně vytvořena.` });
      setShowCreateDialog(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupPrivate(false);
      fetchGroups();
    }
    setCreating(false);
  };

  const joinGroup = async (group: Group) => {
    if (!user) return;

    if (group.is_private) {
      toast({ title: 'Soukromá skupina', description: 'Tato skupina je soukromá. Zakladatel vás musí pozvat.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id });

    if (error) {
      toast({ title: 'Chyba', description: 'Nepodařilo se připojit ke skupině.', variant: 'destructive' });
    } else {
      toast({ title: 'Připojeno!', description: `Nyní jste členem skupiny "${group.name}".` });
      fetchGroups();
    }
  };

  const leaveGroup = async (group: Group) => {
    if (!user || group.owner_id === user.id) return;

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', user.id);

    if (!error) {
      toast({ title: 'Opuštěno', description: `Opustili jste skupinu "${group.name}".` });
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
        setMessages([]);
      }
      fetchGroups();
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedGroup || !newMessage.trim()) return;
    setSendingMessage(true);

    const { error } = await supabase
      .from('group_messages')
      .insert({
        group_id: selectedGroup.id,
        sender_id: user.id,
        content: newMessage.trim(),
      });

    if (error) {
      toast({ title: 'Chyba', description: 'Nepodařilo se odeslat zprávu.', variant: 'destructive' });
    } else {
      setNewMessage('');
    }
    setSendingMessage(false);
  };

  const openManageDialog = (group: Group) => {
    setSelectedGroup(group);
    fetchGroupMembers(group.id);
    setShowManageDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader currentProfile={currentProfile} />
        <Sidebar currentProfile={currentProfile} />
        <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
        <RightSidebar />
        <MobileNav />
      </div>
    );
  }

  const mine = groups.filter((g) => g.is_member);
  const others = groups.filter((g) => !g.is_member);
  const sel = selectedGroup ? groupStyle(selectedGroup) : null;

  const GroupTile = ({ group }: { group: Group }) => {
    const st = groupStyle(group);
    const active = selectedGroup?.id === group.id;
    return (
      <div
        role={group.is_member ? 'button' : undefined}
        tabIndex={group.is_member ? 0 : undefined}
        onClick={() => group.is_member && setSelectedGroup(group)}
        onKeyDown={(e) => e.key === 'Enter' && group.is_member && setSelectedGroup(group)}
        className={cn(
          'group relative flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition',
          group.is_member && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
          active && `ring-2 ${st.ring}`
        )}
      >
        <div className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-inner', st.tile)}>
          {st.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-bold">
            <span className="truncate">{group.name}</span>
            {group.is_private ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="soukromá" />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="veřejná" />
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {group.member_count} {group.member_count === 1 ? 'člen' : (group.member_count ?? 0) >= 2 && (group.member_count ?? 0) <= 4 ? 'členové' : 'členů'}
            {group.owner_id === user?.id && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-amber-600">
                <Crown className="h-3 w-3" /> tvoje
              </span>
            )}
          </p>
          {group.description && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{group.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {group.owner_id === user?.id && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Správa skupiny"
              onClick={(e) => {
                e.stopPropagation();
                openManageDialog(group);
              }}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {group.is_member ? (
            group.owner_id !== user?.id && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Opustit skupinu"
                onClick={(e) => {
                  e.stopPropagation();
                  leaveGroup(group);
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )
          ) : (
            <Button
              size="sm"
              className="rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                joinGroup(group);
              }}
            >
              Přidat se
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-400 p-5 text-white shadow-lg sm:p-6">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(white_1.5px,transparent_1.5px)] [background-size:18px_18px]" />
            <img src={mascotFriends} alt="" className="pointer-events-none absolute -bottom-3 right-2 hidden h-28 w-28 object-contain sm:block" />
            <div className="relative max-w-md">
              <h1 className="flex items-center gap-2 text-2xl font-black sm:text-3xl">
                <Users className="h-7 w-7" /> Skupiny
              </h1>
              <p className="mt-1 text-white/85">Parta na fotbal, kreslení nebo hraní? Založ skupinu a piš si s celou partou najednou.</p>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="mt-4 rounded-full bg-white font-bold text-violet-700 hover:bg-white/90">
                    <Plus className="mr-1.5 h-4 w-4" /> Založit skupinu
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nová skupina</DialogTitle>
                    <DialogDescription>Vyber ikonu, barvu a jméno. Kamarády přidáš potom.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className={cn('flex items-center gap-3 rounded-2xl p-3', GROUP_COLORS[newGroupColor].soft)}>
                      <div className={cn('grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-3xl', GROUP_COLORS[newGroupColor].tile)}>
                        {newGroupEmoji}
                      </div>
                      <p className="truncate text-lg font-bold">{newGroupName.trim() || 'Jméno skupiny'}</p>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-semibold">Ikona</p>
                      <div className="grid grid-cols-6 gap-1.5">
                        {GROUP_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setNewGroupEmoji(em)}
                            className={cn('rounded-xl border-2 py-1.5 text-2xl', newGroupEmoji === em ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted')}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-semibold">Barva</p>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(GROUP_COLORS) as GroupColor[]).map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={GROUP_COLORS[c].name}
                            title={GROUP_COLORS[c].name}
                            onClick={() => setNewGroupColor(c)}
                            className={cn('h-9 w-9 rounded-full bg-gradient-to-br', GROUP_COLORS[c].tile, newGroupColor === c && 'ring-4 ring-primary ring-offset-2 ring-offset-background')}
                          />
                        ))}
                      </div>
                    </div>
                    <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Jméno skupiny…" maxLength={40} />
                    <Textarea
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      placeholder="O čem skupina je (nepovinné)…"
                      rows={2}
                      maxLength={200}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newGroupPrivate} onChange={(e) => setNewGroupPrivate(e.target.checked)} className="rounded" />
                      <Lock className="h-4 w-4" /> Soukromá — přidat se může jen ten, koho pozveš
                    </label>
                    <Button onClick={createGroup} disabled={!newGroupName.trim() || creating} className="w-full rounded-full">
                      {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Založit
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-5">
              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-8 text-center">
                  <img src={mascotFriends} alt="" className="h-28 w-28 object-contain" loading="lazy" />
                  <p className="font-semibold">Zatím tu žádná skupina není.</p>
                  <p className="text-sm text-muted-foreground">Buď první — založ skupinu pro svoji partu!</p>
                </div>
              ) : (
                <>
                  <section className="space-y-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Moje skupiny ({mine.length})</h2>
                    {mine.length === 0 ? (
                      <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Ještě nejsi v žádné. Přidej se dole nebo založ vlastní.</p>
                    ) : (
                      mine.map((g) => <GroupTile key={g.id} group={g} />)
                    )}
                  </section>
                  {others.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Další skupiny</h2>
                      {others.map((g) => (
                        <GroupTile key={g.id} group={g} />
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>

            <div>
              {selectedGroup && sel ? (
                <div className="flex h-[520px] flex-col overflow-hidden rounded-3xl border bg-card shadow-sm md:sticky md:top-6">
                  <div className={cn('flex items-center gap-3 bg-gradient-to-br p-3 text-white', sel.tile)}>
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 text-2xl">{sel.emoji}</div>
                    <div className="min-w-0">
                      <p className="truncate font-black">{selectedGroup.name}</p>
                      <p className="text-xs text-white/80">{selectedGroup.member_count} ve skupině</p>
                    </div>
                  </div>
                  <ScrollArea className={cn('flex-1 p-4', sel.soft)}>
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                        <img src={mascotChat} alt="" className="h-28 w-28 object-contain" loading="lazy" />
                        <p>Zatím ticho. Napiš první zprávu! 👋</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => {
                          const mineMsg = msg.sender_id === user?.id;
                          return (
                            <div key={msg.id} className={cn('flex items-end gap-2', mineMsg && 'flex-row-reverse')}>
                              {!mineMsg && (
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={msg.profile?.avatar_url || ''} />
                                  <AvatarFallback>{msg.profile?.full_name?.[0] || '?'}</AvatarFallback>
                                </Avatar>
                              )}
                              <div
                                className={cn(
                                  'max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm',
                                  mineMsg ? cn(sel.bubble, 'rounded-br-md') : 'rounded-bl-md bg-card'
                                )}
                              >
                                {!mineMsg && <p className="mb-0.5 text-xs font-bold opacity-70">{msg.profile?.full_name || 'Neznámý'}</p>}
                                <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  <div className="border-t p-3">
                    <div className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Napiš zprávu…"
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        disabled={sendingMessage}
                        className="rounded-full"
                      />
                      <Button onClick={sendMessage} disabled={!newMessage.trim() || sendingMessage} size="icon" className="rounded-full" aria-label="Poslat">
                        {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-[520px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-6 text-center text-muted-foreground">
                  <img src={mascotWelcome} alt="" className="h-32 w-32 object-contain" loading="lazy" />
                  <p>Klikni na skupinu a uvidíš, o čem si parta píše.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Manage Members Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Správa skupiny
            </DialogTitle>
            <DialogDescription>
              Přidávejte a odebírejte členy skupiny {selectedGroup?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add member search */}
            <div>
              <label className="text-sm font-medium mb-2 block">Přidat člena</label>
              <Input
                value={searchUsers}
                onChange={(e) => {
                  setSearchUsers(e.target.value);
                  searchForUsers(e.target.value);
                }}
                placeholder="Hledat uživatele..."
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
              {searchResults.length > 0 && (
                <div className="mt-2 border rounded-lg divide-y">
                  {searchResults.map(profile => (
                    <div key={profile.user_id} className="flex items-center justify-between p-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || ''} />
                          <AvatarFallback>{profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{profile.full_name}</p>
                          <p className="text-xs text-muted-foreground">@{profile.username}</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => addMember(profile.user_id)}>
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current members */}
            <div>
              <label className="text-sm font-medium mb-2 block">Členové ({groupMembers.length})</label>
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {groupMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.profile?.avatar_url || ''} />
                        <AvatarFallback>{member.profile?.full_name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-2">
                          {member.profile?.full_name || 'Neznámý'}
                          {member.role === 'owner' && (
                            <Badge variant="secondary" className="text-xs">
                              <Crown className="h-3 w-3 mr-1" />
                              Zakladatel
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">@{member.profile?.username}</p>
                      </div>
                    </div>
                    {member.role !== 'owner' && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => removeMember(member.user_id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Groups;
