import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Castle, History, Pencil, Swords } from 'lucide-react';
import { fortressProfile, successRate } from '@/games/fortress/api';
import { FortressBoard } from './FortressBoard';

type Row = Awaited<ReturnType<typeof fortressProfile>>;

/**
 * Sekcia „Pevnosť" na profile: náhľad, počet nájazdov, úspešnosť.
 * Na cudzom profile tlačidlo na nájazd, na vlastnom na úpravu a záznamy.
 */
export function FortressCard({ ownerId, isOwn }: { ownerId: string; isOwn: boolean }) {
  const [row, setRow] = useState<Row | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fortressProfile(ownerId)
      .then((r) => alive && setRow(r))
      .catch((e) => {
        console.error('[pevnosť] profil zlyhal:', e);
        if (alive) setRow(null);
      });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  if (row === undefined) return null;

  if (!row) {
    if (!isOwn) return null;
    return (
      <Link
        to="/pevnost"
        className="flex items-center gap-3 rounded-2xl border border-dashed p-4 transition hover:bg-muted"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white">
          <Castle className="h-6 w-6" />
        </div>
        <div>
          <p className="font-semibold">Postav si pevnosť</p>
          <p className="text-sm text-muted-foreground">Schovaj poklad a nechaj kamarátov, nech ho skúsia vykradnúť.</p>
        </div>
      </Link>
    );
  }

  const grid = row.grid as { cells: string };
  const rate = successRate(row.raids, row.successes);

  return (
    <div className="flex gap-4 rounded-2xl border bg-card p-4">
      <FortressBoard cells={grid.cells} ts={8} ownerView={isOwn} className="shrink-0 rounded-lg shadow" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Castle className="h-5 w-5 text-slate-600" />
          <h3 className="font-bold">Pevnosť</h3>
          {isOwn && !row.published && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">rozpracovaná</span>
          )}
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-black tabular-nums">{row.raids}</p>
            <p className="text-xs text-muted-foreground">nájazdov</p>
          </div>
          <div>
            <p className="text-2xl font-black tabular-nums">{row.raids ? `${100 - rate} %` : '—'}</p>
            <p className="text-xs text-muted-foreground">odrazených</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {isOwn ? (
            <>
              <Link
                to="/pevnost"
                className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                <Pencil className="h-4 w-4" /> Upraviť
              </Link>
              <Link
                to="/pevnost?tab=zaznamy"
                className="inline-flex items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-sm font-semibold hover:bg-muted/70"
              >
                <History className="h-4 w-4" /> Záznamy
              </Link>
            </>
          ) : (
            <Link
              to={`/pevnost?raid=${row.id}`}
              className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-orange-400"
            >
              <Swords className="h-4 w-4" /> Vykradnúť
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
