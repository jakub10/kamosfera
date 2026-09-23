import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Castle, Eraser, FlaskConical, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';
import {
  W, H, BUDGET, COST, emptyCells, gridCost, gridProblems, type Tile, type Replay,
} from '@/games/fortress/engine';
import { drawSwatch } from '@/games/fortress/render';
import { STARTER_CELLS } from '@/games/fortress/templates';
import { loadMyFortress, saveFortress, type Fortress } from '@/games/fortress/api';
import { useToast } from '@/hooks/use-toast';
import { FortressBoard } from './FortressBoard';
import { RunView } from './RunView';
import { cn } from '@/lib/utils';

interface ToolDef {
  tile: Tile;
  name: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { tile: '#', name: 'Stena', hint: 'Nedá sa prejsť ani rozbiť.' },
  { tile: 'b', name: 'Krehká stena', hint: 'Padne na dva údery.' },
  { tile: 'D', name: 'Dvere', hint: 'Otvorí ich kľúč.' },
  { tile: 'k', name: 'Kľúč', hint: 'Jeden kľúč = jedny dvere.' },
  { tile: '^', name: 'Bodce', hint: 'Uberú 3 sekundy.' },
  { tile: 'S', name: 'Píla ↔', hint: 'Hliadkuje vľavo-vpravo, uberie 5 s.' },
  { tile: 'V', name: 'Píla ↕', hint: 'Hliadkuje hore-dole, uberie 5 s.' },
  { tile: 'o', name: 'Falošná podlaha', hint: 'Nájazdník ju nevidí. Spadne späť k vchodu.' },
  { tile: 'T', name: 'Teleport', hint: 'Vždy dva — prenesie z jedného na druhý.' },
  { tile: 'E', name: 'Vchod', hint: 'Tu nájazd začína aj končí.' },
  { tile: '$', name: 'Poklad', hint: 'To, o čo ide.' },
  { tile: '.', name: 'Guma', hint: 'Vráti podlahu.' },
];

const draftKey = (uid: string) => `pevnost-rozpracovana-${uid}`;

function Swatch({ tile, size = 28 }: { tile: Tile; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSwatch(ctx, tile, size);
  }, [tile, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded" aria-hidden />;
}

export function FortressEditor({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<Fortress | null>(null);
  const [cells, setCells] = useState<string>(emptyCells());
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tile>('#');
  const [hover, setHover] = useState<number | null>(null);
  const [tested, setTested] = useState<{ cells: string; replay: Replay } | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const painting = useRef(false);
  const lastPainted = useRef(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const [ts, setTs] = useState(24);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.getBoundingClientRect().width;
      const maxH = window.innerHeight * 0.62;
      setTs(Math.max(14, Math.floor(Math.min(w / W, maxH / H, 38))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  const reload = useCallback(async () => {
    const f = await loadMyFortress(uid);
    setSaved(f);
    return f;
  }, [uid]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await reload();
        if (!alive) return;
        let draft: string | null = null;
        try {
          draft = localStorage.getItem(draftKey(uid));
        } catch {
          /* súkromné okno */
        }
        // Rozpracovaná verzia z prehliadača má prednosť, ak sa líši — inak
        // by sa stratilo, čo dieťa stavalo, keď zavrelo okno pred uložením.
        if (draft && draft.length === W * H && draft !== f?.grid.cells) setCells(draft);
        else if (f) setCells(f.grid.cells);
      } catch (e) {
        console.error('[pevnosť] načítanie zlyhalo:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, reload]);

  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(draftKey(uid), cells);
    } catch {
      /* súkromné okno */
    }
  }, [cells, uid, loading]);

  const cost = useMemo(() => gridCost(cells), [cells]);
  const problems = useMemo(() => gridProblems(cells), [cells]);
  const dirty = saved ? saved.grid.cells !== cells : true;
  const testedNow = tested?.cells === cells;
  const live = saved?.published && !dirty;

  const apply = useCallback(
    (i: number, first: boolean) => {
      setCells((prev) => {
        const cur = prev[i] as Tile;
        if (cur === tool) return prev;
        const arr = prev.split('');
        // Vchod a poklad sa len presúvajú — vždy musia existovať.
        if ((cur === 'E' || cur === '$') && tool !== 'E' && tool !== '$') {
          if (first) toast({ title: cur === 'E' ? 'Vchod sa dá len presunúť' : 'Poklad sa dá len presunúť' });
          return prev;
        }
        if (tool === 'E' || tool === '$') {
          if (!first || cur === 'E' || cur === '$') return prev;
          const old = prev.indexOf(tool);
          if (old >= 0) arr[old] = '.';
          arr[i] = tool;
          return arr.join('');
        }
        if (tool === 'T' && cur !== 'T' && prev.split('T').length - 1 >= 2) {
          if (first) toast({ title: 'Teleporty môžu byť len dva' });
          return prev;
        }
        arr[i] = tool;
        const next = arr.join('');
        if (gridCost(next) > BUDGET) {
          if (first) toast({ title: 'Došiel rozpočet', description: `Na stavbu je ${BUDGET} bodov. Niečo zbúraj.` });
          return prev;
        }
        return next;
      });
    },
    [tool, toast]
  );

  const publish = async () => {
    if (!tested || tested.cells !== cells) return;
    setBusy(true);
    try {
      await saveFortress(uid, cells, tested.replay);
      await reload();
      toast({ title: 'Pevnosť je zverejnená! 🏰', description: 'Kamaráti ju teraz môžu vykrádať.' });
    } catch (e) {
      console.error('[pevnosť] zverejnenie zlyhalo:', e);
      toast({ title: 'Nepodarilo sa zverejniť', description: String((e as Error).message ?? e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      await saveFortress(uid, cells, null);
      await reload();
      toast({ title: 'Uložené', description: 'Kým ju neotestuješ a nezverejníš, kamaráti ju nevidia.' });
    } catch (e) {
      console.error('[pevnosť] uloženie zlyhalo:', e);
      toast({ title: 'Nepodarilo sa uložiť', description: String((e as Error).message ?? e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeTool = TOOLS.find((t) => t.tile === tool)!;

  return (
    <div className="space-y-4">
      <StatusBanner live={!!live} dirty={dirty} saved={!!saved} testedNow={testedNow} published={!!saved?.published} />

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div ref={boxRef} className="min-w-0">
          <FortressBoard
            cells={cells}
            ts={ts}
            ownerView
            animate
            hover={hover}
            onHover={setHover}
            className="mx-auto cursor-crosshair rounded-xl shadow-lg ring-1 ring-border"
            onPointerDown={(i) => {
              painting.current = true;
              lastPainted.current = i;
              apply(i, true);
            }}
            onPointerMove={(i) => {
              if (!painting.current || i === lastPainted.current) return;
              lastPainted.current = i;
              apply(i, false);
            }}
            onPointerUp={() => {
              painting.current = false;
            }}
          />
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm font-semibold">
              <span>Rozpočet</span>
              <span className={cn('tabular-nums', cost > BUDGET * 0.9 && 'text-orange-500')}>
                {cost} / {BUDGET}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', cost > BUDGET * 0.9 ? 'bg-orange-500' : 'bg-emerald-500')}
                style={{ width: `${Math.min(100, (cost / BUDGET) * 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-4">
            {TOOLS.map((t) => (
              <button
                key={t.tile}
                type="button"
                onClick={() => setTool(t.tile)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] font-medium leading-tight transition',
                  tool === t.tile ? 'border-primary bg-primary/10 ring-2 ring-primary' : 'border-border hover:bg-muted'
                )}
                title={t.hint}
              >
                {t.tile === '.' ? <Eraser className="h-7 w-7 p-1" /> : <Swatch tile={t.tile} />}
                <span className="text-center">{t.name}</span>
                {COST[t.tile] > 0 && <span className="text-[10px] text-muted-foreground">{COST[t.tile]} b.</span>}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{activeTool.name}:</strong> {activeTool.hint}
          </p>

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={problems.length > 0}
              onClick={() => setTesting(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-40"
            >
              <FlaskConical className="h-4 w-4" /> Otestovať
            </button>
            <button
              type="button"
              disabled={!testedNow || busy || !!live}
              onClick={publish}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Castle className="h-4 w-4" />} Zverejniť
            </button>
            <button
              type="button"
              disabled={!dirty || busy || problems.length > 0}
              onClick={saveDraft}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> Uložiť rozpracovanú
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => setCells(STARTER_CELLS)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Sparkles className="h-4 w-4" /> Štartovacia pevnosť
            </button>
            <button
              type="button"
              onClick={() => setCells(emptyCells())}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" /> Začať odznova
            </button>
          </div>
        </div>
      </div>

      {testing && (
        <RunView
          cells={cells}
          mode="test"
          title="Test tvojej pevnosti"
          onClose={() => setTesting(false)}
          onFinish={(r, replay) => {
            if (r.success) setTested({ cells, replay });
          }}
          resultAction={
            tested?.cells === cells && !live ? (
              <button
                type="button"
                onClick={async () => {
                  setTesting(false);
                  await publish();
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
              >
                <Castle className="h-4 w-4" /> Zverejniť
              </button>
            ) : null
          }
        />
      )}
    </div>
  );
}

function StatusBanner({
  live, dirty, saved, testedNow, published,
}: { live: boolean; dirty: boolean; saved: boolean; testedNow: boolean; published: boolean }) {
  let tone = 'bg-muted text-foreground';
  let text = 'Postav pevnosť a schovaj poklad. Pred zverejnením ju treba raz prejsť vlastnými silami — aby sa nedala postaviť nemožná.';
  if (live) {
    tone = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    text = 'Pevnosť je zverejnená ✓ Kamaráti ju môžu vykrádať.';
  } else if (testedNow) {
    tone = 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
    text = 'Otestovaná ✓ Môžeš ju zverejniť.';
  } else if (published && dirty) {
    tone = 'bg-orange-500/10 text-orange-700 dark:text-orange-300';
    text = 'Zverejnená pevnosť sa zmenila. Otestuj ju a zverejni znova — uloženie zmien ju dovtedy stiahne.';
  } else if (saved && !published) {
    tone = 'bg-muted text-foreground';
    text = 'Rozpracovaná — kamaráti ju zatiaľ nevidia. Otestuj ju a zverejni.';
  }
  return <div className={cn('rounded-xl px-4 py-3 text-sm font-medium', tone)}>{text}</div>;
}
