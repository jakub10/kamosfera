import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Castle, History, Loader2, Swords, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/social/Sidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { FortressEditor } from '@/components/fortress/FortressEditor';
import {
  FortressBrowse, FortressLeaderboard, FortressRecords, type RaidTarget, type ReplayTarget,
} from '@/components/fortress/FortressLists';
import { RunView } from '@/components/fortress/RunView';
import { loadFortress, profilesByIds, submitRaid, formatTime } from '@/games/fortress/api';
import { cn } from '@/lib/utils';

/**
 * Pevnosť & Nájazd.
 *
 * Postav pevnosť, schovaj poklad, kamaráti ju vykradnú za 60 sekúnd.
 * Nikto nemusí byť online v rovnakom čase — majiteľ si potom pozrie celý
 * nájazd a pevnosť vylepší.
 */

type Tab = 'moja' | 'vykradnut' | 'zaznamy' | 'rebricek';

const TABS: { id: Tab; label: string; icon: typeof Castle }[] = [
  { id: 'moja', label: 'Moja pevnosť', icon: Castle },
  { id: 'vykradnut', label: 'Vykradnúť', icon: Swords },
  { id: 'zaznamy', label: 'Záznamy', icon: History },
  { id: 'rebricek', label: 'Rebríček', icon: Trophy },
];

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Pevnost = () => {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'moja') as Tab;
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [raid, setRaid] = useState<RaidTarget | null>(null);
  const [raidNote, setRaidNote] = useState<ReactNode>(null);
  const [replay, setReplay] = useState<ReplayTarget | null>(null);
  // Po nájazde sa zoznamy načítajú znova, aby sedeli počty a rekordy.
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setCurrentProfile(data));
  }, [user]);

  // Odkaz z profilu: /pevnost?raid=<id> otvorí rovno nájazd.
  useEffect(() => {
    const id = params.get('raid');
    if (!id || !user) return;
    (async () => {
      try {
        const f = await loadFortress(id);
        if (!f || !f.published || f.owner_id === user.id) return;
        const ppl = await profilesByIds([f.owner_id]);
        setRaid({ id: f.id, cells: f.grid.cells, ownerName: ppl[f.owner_id]?.full_name ?? 'kamaráta' });
      } catch (e) {
        console.error('[pevnosť] odkaz na nájazd zlyhal:', e);
      } finally {
        params.delete('raid');
        setParams(params, { replace: true });
      }
    })();
    // params sa mení s každou zmenou URL; stačí reagovať na id nájazdu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('raid'), user]);

  const setTab = (t: Tab) => {
    params.set('tab', t);
    setParams(params, { replace: true });
  };

  const onRaidFinish = useCallback(
    async (result: { success: boolean; timeMs: number; hits: number }, rep: Parameters<typeof submitRaid>[3]) => {
      if (!raid || !user) return;
      setRaidNote(
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-4 w-4 animate-spin" /> Zapisujem nájazd…
        </span>
      );
      try {
        await submitRaid(raid.id, user.id, result, rep);
        setRaidNote(
          result.success
            ? `Zapísané! ${raid.ownerName} dostane správu o tvojom nájazde: ${formatTime(result.timeMs)}. 😎`
            : 'Zapísané. Majiteľ uvidí celý nájazd — a ty už vieš, kde sú pasce.'
        );
        setRefresh((n) => n + 1);
      } catch (e) {
        console.error('[pevnosť] zápis nájazdu zlyhal:', e);
        setRaidNote(<span className="font-semibold text-red-600">{(e as Error).message ?? 'Nájazd sa nepodarilo zapísať.'}</span>);
      }
    },
    [raid, user]
  );

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="px-4 pb-24 pt-16 md:ml-64 md:px-8 md:pb-8 md:pt-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow">
              <Castle className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black">Pevnosť & Nájazd</h1>
              <p className="text-muted-foreground">Postav pevnosť, schovaj poklad. Kamaráti majú 60 sekúnd.</p>
            </div>
          </header>

          <nav className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 sm:flex">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition',
                    tab === t.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </nav>

          {loading ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !user ? (
            <div className="rounded-2xl border p-8 text-center">
              <p className="mb-3">Na stavanie a vykrádanie pevností sa treba prihlásiť.</p>
              <Link to="/" className="font-semibold text-primary underline">
                Prihlásiť sa
              </Link>
            </div>
          ) : tab === 'moja' ? (
            <FortressEditor uid={user.id} />
          ) : tab === 'vykradnut' ? (
            <FortressBrowse
              key={refresh}
              onRaid={(t) => {
                setRaidNote(null);
                setRaid(t);
              }}
            />
          ) : tab === 'zaznamy' ? (
            <FortressRecords key={refresh} uid={user.id} onReplay={setReplay} />
          ) : (
            <FortressLeaderboard key={refresh} />
          )}
        </div>
      </main>

      <MobileNav />

      {raid && (
        <RunView
          cells={raid.cells}
          mode="raid"
          title={`Nájazd na pevnosť: ${raid.ownerName}`}
          onFinish={onRaidFinish}
          onClose={() => setRaid(null)}
          resultNote={raidNote}
        />
      )}
      {replay && (
        <RunView
          cells={replay.raid.replay.cells}
          mode="replay"
          title={replay.title}
          replay={replay.raid.replay}
          claimed={{ success: replay.raid.success, timeMs: replay.raid.time_ms, hits: replay.raid.trap_hits }}
          onClose={() => setReplay(null)}
        />
      )}
    </div>
  );
};

export default Pevnost;
