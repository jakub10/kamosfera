import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { act as sendAction, loadView, tick, type Action, type View } from './api';

/**
 * Živý stav jedného stola.
 *
 * Databáza pri každom ťahu zvýši číslo verzie stola a Supabase Realtime nám
 * o tom pošle správu — vtedy si vypýtame nový pohľad. Keby správa neprišla
 * (slabý internet, uspaný notebook), stôl sa aj tak každých pár sekúnd
 * obnoví sám.
 *
 * Časovač: keď hráčovi na ťahu vyprší čas, ktokoľvek pri stole „zaklope"
 * (hh_tick) a server ťah ukončí zaňho. Nikto tak hru nezasekne.
 */
export function useStarRoom(roomId: string | null) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Rozdiel hodín prehliadača a servera v ms (server − my). */
  const [offset, setOffset] = useState(0);
  const versionRef = useRef<number>(-1);
  const loadingRef = useRef(false);
  const lastTick = useRef(0);

  const apply = useCallback((v: View) => {
    // Staršia odpoveď, ktorá dorazila neskôr, nesmie prepísať novšiu.
    if (v.room.version < versionRef.current) return;
    versionRef.current = v.room.version;
    setOffset(new Date(v.now).getTime() - Date.now());
    setView(v);
  }, []);

  const refresh = useCallback(async () => {
    if (!roomId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      apply(await loadView(roomId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingRef.current = false;
    }
  }, [roomId, apply]);

  useEffect(() => {
    versionRef.current = -1;
    setView(null);
    setError(null);
    if (!roomId) return;
    void refresh();

    const channel = supabase
      .channel(`hh-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hh_rooms', filter: `id=eq.${roomId}` }, () => {
        void refresh();
      })
      .subscribe();

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  // Vypršaný čas → zaklopať (najviac raz za 3 s, s kúskom náhody, aby
  // všetci nezaklopali naraz).
  useEffect(() => {
    if (!roomId || view?.room.status !== 'playing' || !view.room.deadline) return;
    const deadline = new Date(view.room.deadline).getTime();
    const wait = Math.max(0, deadline - (Date.now() + offset)) + 800 + Math.random() * 1200;
    const t = window.setTimeout(async () => {
      if (Date.now() - lastTick.current < 3000) return;
      lastTick.current = Date.now();
      try {
        apply(await tick(roomId));
      } catch {
        /* nevadí — skúsi to niekto iný alebo ďalšie obnovenie */
      }
    }, wait);
    return () => window.clearTimeout(t);
  }, [roomId, view?.room.status, view?.room.deadline, view?.room.version, offset, apply]);

  const act = useCallback(
    async (a: Action) => {
      if (!roomId) return false;
      setBusy(true);
      try {
        apply(await sendAction(roomId, a));
        setError(null);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [roomId, apply]
  );

  return { view, error, setError, busy, act, refresh, apply, offset };
}
