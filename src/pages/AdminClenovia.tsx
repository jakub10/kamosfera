import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { adminGuardStatus, adminMembers, adminSetApproval, adminSetMessageGuard, type AdminMember, type GuardStatus } from '@/lib/childSafety';
import { useSafety } from '@/components/safety/SafetyGate';
import { cn } from '@/lib/utils';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(iso));

/**
 * Správca (rola creator) púšťa nové deti dnu. Kým je Kamosféra malý okruh
 * kamarátov, správca pozná rodiny a vie, koho pustiť.
 */
const AdminClenovia = () => {
  const { status } = useSafety();
  const [list, setList] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [guard, setGuard] = useState<GuardStatus | null>(null);

  const load = useCallback(async () => {
    try {
      adminGuardStatus().then(setGuard).catch(() => setGuard(null));
      setList(await adminMembers());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (status?.is_admin) void load();
  }, [status?.is_admin, load]);

  const set = async (m: AdminMember, approved: boolean) => {
    if (!approved && !window.confirm(`Opravdu zamknout ${m.username}? Neuvidí nic, dokud ho znovu nepustíš.`)) return;
    setBusy(m.user_id);
    try {
      await adminSetApproval(m.user_id, approved);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status?.is_admin) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <p>
          Tahle stránka je jen pro správce. <Link to="/" className="font-semibold text-primary underline">Domov</Link>
        </p>
      </div>
    );
  }

  const waiting = list?.filter((m) => !m.approved) ?? [];
  const noConsent = list?.filter((m) => m.approved && !m.consent_at) ?? [];
  // Pôvodní členovia (aj rodičia) súhlas nedávali — ten sa pýta len od nových.
  const ok = list?.filter((m) => m.approved && m.consent_at) ?? [];

  const Row = ({ m }: { m: AdminMember }) => (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {m.full_name} <span className="font-normal text-muted-foreground">@{m.username}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          účet od {fmt(m.created_at)} ·{' '}
          {m.consent_at ? (
            <span className="text-emerald-600">
              souhlas ✓ {m.consent_name ? `(${m.consent_name})` : ''} {fmt(m.consent_at)}
            </span>
          ) : (
            <span className="text-amber-600">čeká na souhlas dospělého</span>
          )}{' '}
          · {m.guardian ? 'důvěrník ✓' : 'bez důvěrníka'}
          {m.invited_by && <span className="font-semibold text-violet-600"> · pozval(a) @{m.invited_by}</span>}
        </p>
      </div>
      {m.approved ? (
        <button
          type="button"
          onClick={() => void set(m, false)}
          disabled={busy === m.user_id}
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold text-red-600"
        >
          <X className="h-3.5 w-3.5" /> Zamknout
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void set(m, true)}
          disabled={!m.consent_at || busy === m.user_id}
          title={m.consent_at ? '' : 'Nejdřív musí dospělý potvrdit souhlas'}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Pustit dovnitř
        </button>
      )}
    </li>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-emerald-600" />
          <div className="flex-1">
            <h1 className="text-2xl font-black">Členové</h1>
            <p className="text-sm text-muted-foreground">Nové pusť dovnitř, až když znáš rodinu a dospělý dal souhlas.</p>
          </div>
          <Link to="/" className="text-sm font-semibold text-primary underline">
            Zpět
          </Link>
        </header>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
        {guard && (
          <section className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">🤖 AI strážce zpráv {guard.enabled ? '— zapnutý' : '— vypnutý'}</h2>
                <p className="text-xs text-muted-foreground">
                  Zapni ho, až když je v Supabase nahraná funkce <code>message-guard</code> a v Secrets je{' '}
                  <code>LIQUID_API_KEY</code>. Zapnutý strážce nepustí zprávu, kterou neviděl.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(guard.enabled ? 'Vypnout strážce zpráv?' : 'Zapnout strážce zpráv? Funkce message-guard musí být nahraná.')) return;
                  try {
                    await adminSetMessageGuard(!guard.enabled);
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-bold',
                  guard.enabled ? 'border text-red-600' : 'bg-emerald-500 text-white'
                )}
              >
                {guard.enabled ? 'Vypnout' : 'Zapnout'}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Za 24 hodin: zkontrolováno {guard.checked_24h} · zeptal se {guard.confirm_24h}× · nedoručil {guard.hidden_24h}
              {guard.unchecked_24h > 0 && (
                <span className="font-semibold text-amber-600"> · bez kontroly {guard.unchecked_24h} (Liquid AI neodpovědělo nebo chybí klíč)</span>
              )}
            </p>
          </section>
        )}
        {list === null ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            <section>
              <h2 className="mb-2 font-bold">Čekají na vstup ({waiting.length})</h2>
              {waiting.length ? <ul className="space-y-2">{waiting.map((m) => <Row key={m.user_id} m={m} />)}</ul> : <p className="text-sm text-muted-foreground">Nikdo nečeká.</p>}
            </section>
            <section>
              <h2 className="mb-2 font-bold">Schválení, ale ještě bez souhlasu rodiče ({noConsent.length})</h2>
              {noConsent.length ? <ul className="space-y-2">{noConsent.map((m) => <Row key={m.user_id} m={m} />)}</ul> : <p className="text-sm text-muted-foreground">Všichni mají souhlas. 🎉</p>}
            </section>
            <section className={cn(!ok.length && 'hidden')}>
              <h2 className="mb-2 font-bold">V Kamosféře ({ok.length})</h2>
              <ul className="space-y-2">{ok.map((m) => <Row key={m.user_id} m={m} />)}</ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminClenovia;
