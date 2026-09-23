import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { sk } from 'date-fns/locale';
import { Loader2, Play, Swords, Trophy, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FortressBoard } from './FortressBoard';
import {
  browseFortresses, fortressLeaderboard, loadMyFortress, raidsOnFortress, myRaids,
  profilesByIds, formatTime, successRate, type MiniProfile, type RaidRow,
} from '@/games/fortress/api';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export interface RaidTarget {
  id: string;
  cells: string;
  ownerName: string;
}

function Face({ p, size = 'h-9 w-9' }: { p?: Pick<MiniProfile, 'full_name' | 'avatar_url'> | null; size?: string }) {
  return (
    <Avatar className={size}>
      <AvatarImage src={p?.avatar_url ?? ''} />
      <AvatarFallback>{p?.full_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
    </Avatar>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{children}</div>;
}

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: sk });

// ---------------------------------------------------------------------------

type BrowseRow = Awaited<ReturnType<typeof browseFortresses>>[number];

export function FortressBrowse({ onRaid }: { onRaid: (t: RaidTarget) => void }) {
  const [rows, setRows] = useState<BrowseRow[] | null>(null);

  useEffect(() => {
    browseFortresses()
      .then(setRows)
      .catch((e) => {
        console.error('[pevnosť] zoznam zlyhal:', e);
        setRows([]);
      });
  }, []);

  if (!rows) return <Loading />;
  if (!rows.length)
    return <Empty>Zatiaľ tu nie je žiadna zverejnená pevnosť. Postav svoju a pošli kamarátom!</Empty>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((f) => {
        const grid = f.grid as { cells: string };
        return (
          <div key={f.id} className="flex gap-3 rounded-2xl border bg-card p-3">
            <FortressBoard cells={grid.cells} ts={6} className="shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <Face p={f} size="h-7 w-7" />
                <span className="truncate font-semibold">{f.full_name}</span>
                {f.is_friend && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    <Users className="mr-0.5 inline h-3 w-3" />kamarát
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {f.raids ? `${f.raids}× vykrádaná · padla v ${successRate(f.raids, f.successes)} %` : 'Ešte ju nikto nevykrádal'}
              </p>
              {f.my_best_ms != null && (
                <p className="text-xs font-medium text-emerald-600">Tvoj rekord: {formatTime(f.my_best_ms)}</p>
              )}
              <button
                type="button"
                onClick={() => onRaid({ id: f.id, cells: grid.cells, ownerName: f.full_name })}
                className="mt-auto inline-flex w-fit items-center gap-1 rounded-xl bg-orange-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-orange-400"
              >
                <Swords className="h-4 w-4" /> Vykradnúť
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface ReplayTarget {
  raid: RaidRow;
  title: string;
}

function RaidLine({
  who, raid, extra, onPlay,
}: { who?: MiniProfile | null; raid: RaidRow; extra?: string; onPlay: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <Face p={who} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {who?.full_name ?? 'Niekto'} {extra}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className={cn('font-bold', raid.success ? 'text-emerald-600' : 'text-red-500')}>
            {raid.success ? `vykradnuté za ${formatTime(raid.time_ms)}` : 'nestihol/a'}
          </span>
          {' · '}
          {raid.trap_hits} × pasca · {ago(raid.created_at)}
        </p>
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold hover:bg-muted/70"
      >
        <Play className="h-4 w-4" /> Prehrať
      </button>
    </div>
  );
}

export function FortressRecords({ uid, onReplay }: { uid: string; onReplay: (t: ReplayTarget) => void }) {
  const [onMine, setOnMine] = useState<RaidRow[] | null>(null);
  const [mine, setMine] = useState<RaidRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, MiniProfile>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const f = await loadMyFortress(uid);
        const [a, b] = await Promise.all([f ? raidsOnFortress(f.id) : Promise.resolve([]), myRaids(uid)]);
        // Pevnosti, ktoré som vykrádal: kto je ich majiteľ.
        const fids = [...new Set(b.map((r) => r.fortress_id))];
        const { data: fs } = fids.length
          ? await supabase.from('fortresses').select('id, owner_id').in('id', fids)
          : { data: [] as { id: string; owner_id: string }[] };
        const ownerOf: Record<string, string> = {};
        for (const x of fs ?? []) ownerOf[x.id] = x.owner_id;
        const ppl = await profilesByIds([...a.map((r) => r.raider_id), ...Object.values(ownerOf)]);
        setOwners(ownerOf);
        setPeople(ppl);
        setOnMine(a);
        setMine(b);
      } catch (e) {
        console.error('[pevnosť] záznamy zlyhali:', e);
        setOnMine([]);
        setMine([]);
      }
    })();
  }, [uid]);

  if (!onMine || !mine) return <Loading />;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-bold">Nájazdy na tvoju pevnosť</h3>
        {onMine.length ? (
          onMine.map((r) => (
            <RaidLine
              key={r.id}
              who={people[r.raider_id]}
              raid={r}
              onPlay={() => onReplay({ raid: r, title: `${people[r.raider_id]?.full_name ?? 'Niekto'} útočí na tvoju pevnosť` })}
            />
          ))
        ) : (
          <Empty>Zatiaľ nikto. Keď ťa niekto vykradne, uvidíš tu celý jeho nájazd — a kde sa zasekol.</Empty>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="font-bold">Tvoje nájazdy</h3>
        {mine.length ? (
          mine.map((r) => {
            const owner = people[owners[r.fortress_id]];
            return (
              <RaidLine
                key={r.id}
                who={owner}
                extra={owner ? '— pevnosť' : '(pevnosť je stiahnutá)'}
                raid={r}
                onPlay={() => onReplay({ raid: r, title: `Tvoj nájazd na pevnosť ${owner?.full_name ?? ''}`.trim() })}
              />
            );
          })
        ) : (
          <Empty>Zatiaľ žiadny nájazd. Pozri sa do záložky Vykradnúť.</Empty>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

type LeaderRow = Awaited<ReturnType<typeof fortressLeaderboard>>[number];

export function FortressLeaderboard() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    fortressLeaderboard()
      .then(setRows)
      .catch((e) => {
        console.error('[pevnosť] rebríček zlyhal:', e);
        setRows([]);
      });
  }, []);

  if (!rows) return <Loading />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Najtvrdšie pevnosti — tie, ktoré padajú najmenej. Do rebríčka sa dostane pevnosť, ktorú niekto vykrádal aspoň
        päťkrát.
      </p>
      {rows.length ? (
        rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full font-black',
                i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-orange-300 text-orange-950' : 'bg-muted'
              )}
            >
              {i + 1}
            </span>
            <Face p={r} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {r.raids} nájazdov · padla v {successRate(r.raids, r.successes)} %
              </p>
            </div>
            {i === 0 && <Trophy className="h-5 w-5 text-amber-500" />}
          </div>
        ))
      ) : (
        <Empty>Rebríček je zatiaľ prázdny. Keď pevnosť vydrží aspoň päť nájazdov, objaví sa tu.</Empty>
      )}
    </div>
  );
}
