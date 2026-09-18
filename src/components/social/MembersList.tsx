import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, UserPlus, UserCheck, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface Member {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

type FriendState = 'none' | 'sent' | 'received' | 'friends';

interface MembersListProps {
  /** Kolik lidí ukázat; bez limitu = všechny. */
  limit?: number;
  /** Kompaktní řádky pro postranní sloupec. */
  compact?: boolean;
}

/**
 * Kdo je v Kamosféře.
 *
 * Malá uzavřená síť umí něco, co velká nemůže: ukázat všechny. Když je tu
 * třicet dětí z jedné školy, seznam „kdo je tady" je nejpřirozenější první
 * krok — a jediný pravdivý způsob, jak najít kamaráda, když si nepamatuješ,
 * jak se přesně jmenuje jeho přezdívka.
 */
export function MembersList({ limit, compact }: MembersListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [states, setStates] = useState<Record<string, FriendState>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .neq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);

    const [{ data: profiles }, { data: friendships }] = await Promise.all([
      query,
      supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);

    const map: Record<string, FriendState> = {};
    for (const f of friendships || []) {
      const other = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      if (f.status === 'accepted') map[other] = 'friends';
      else if (f.status === 'pending') map[other] = f.requester_id === user.id ? 'sent' : 'received';
    }

    setMembers(profiles || []);
    setStates(map);
    setLoading(false);
  }, [user, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const addFriend = async (member: Member) => {
    if (!user) return;
    setPending(member.user_id);

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: member.user_id, status: 'pending' });

    setPending(null);

    if (error) {
      toast({ title: 'Nepovedlo se', description: 'Zkus to prosím znovu.', variant: 'destructive' });
      return;
    }

    setStates((prev) => ({ ...prev, [member.user_id]: 'sent' }));
    toast({ title: 'Žádost odeslána', description: `${member.full_name} se to dozví.` });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Zatím jsi tu sám. Pozvi kamarády ze školy!
      </p>
    );
  }

  return (
    <ul className={compact ? 'space-y-3' : 'space-y-2'}>
      {members.map((m) => {
        const state = states[m.user_id] ?? 'none';
        return (
          <li
            key={m.user_id}
            className={
              compact
                ? 'flex items-center gap-3'
                : 'flex items-center gap-4 rounded-xl border border-border bg-card p-4'
            }
          >
            <Link to={`/profile/${m.user_id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
              <Avatar className={compact ? 'h-9 w-9' : 'h-12 w-12'}>
                <AvatarImage src={m.avatar_url || ''} />
                <AvatarFallback>{m.full_name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className={`truncate font-medium ${compact ? 'text-sm' : ''}`}>{m.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">@{m.username}</p>
              </div>
            </Link>

            {state === 'none' && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending === m.user_id}
                onClick={() => void addFriend(m)}
              >
                {pending === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {!compact && <span className="ml-2">Přidat</span>}
              </Button>
            )}
            {state === 'sent' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Odesláno
              </span>
            )}
            {state === 'received' && (
              <Button size="sm" asChild>
                <Link to={`/profile/${m.user_id}`}>Chce být kamarád</Link>
              </Button>
            )}
            {state === 'friends' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> Kamarádi
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
