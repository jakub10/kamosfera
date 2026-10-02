import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Friend {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Pravý stĺpec: moji kamaráti. Kedysi tu bol zoznam všetkých ľudí
 * v Kamosfére — dnes sa nikto nedá nájsť, kamaráti vznikajú len naživo.
 */
export function RightSidebar() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: rows } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .limit(50);
      const ids = (rows ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
      if (!ids.length) return setFriends([]);
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', ids)
        .order('username')
        .limit(6);
      setFriends(data ?? []);
    })();
  }, [user]);

  return (
    <aside className="hidden lg:block fixed right-0 top-0 h-screen w-80 bg-card border-l border-border p-4 overflow-y-auto">
      <div className="bg-secondary rounded-xl p-4">
        <h3 className="font-semibold mb-1">Moji kamaráti</h3>
        <p className="text-xs text-muted-foreground mb-4">Kamaráta si pridáš naživo, keď ste spolu.</p>
        {friends && friends.length === 0 && (
          <p className="text-sm text-muted-foreground">Zatiaľ žiadni — ukáž kamarátovi svoj kód. 🙂</p>
        )}
        <ul className="space-y-2">
          {(friends ?? []).map((f) => (
            <li key={f.user_id}>
              <Link to={`/profile/${f.user_id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-background/60">
                {f.avatar_url ? (
                  <img src={f.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-muted">🧑</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{f.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">@{f.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="w-full mt-4 text-primary" asChild>
          <Link to="/kamarati">Pridať kamaráta</Link>
        </Button>
      </div>
    </aside>
  );
}
