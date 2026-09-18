import { useEffect, useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { Button } from '@/components/ui/button';
import mascotSearch from '@/assets/mascot-search.png';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

/** Kde Kamosvět běží. Bez nastavení se stránka jen představí a dveře zůstanou zavřené. */
const KAMOSVET_URL = (import.meta.env.VITE_KAMOSVET_URL as string | undefined)?.trim();

/**
 * Jediný vstup do Kamosvěta.
 *
 * Kamosvět nemá vlastní přihlášení. Dítě do něj vejde odsud, se svou session
 * v adrese (fragment za #, který prohlížeč neposílá na server), a svět se
 * Kamosféry zeptá jedinou otázkou: world_seed(). Bez Kamosféry je Kamosvět
 * jen Nicota — a tak to má být.
 */
const Svet = () => {
  const { user, session } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [growth, setGrowth] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setCurrentProfile(data));

    // Jen na ukázku, kolik světa dítě zatím má. Svět sám si seed čte znovu.
    supabase.rpc('world_seed').then(({ data }) => {
      const g = (data as { growth?: number } | null)?.growth;
      setGrowth(typeof g === 'number' ? g : null);
    });
  }, [user]);

  const enter = () => {
    if (!KAMOSVET_URL || !session) return;
    const fragment = new URLSearchParams({
      access_token: session.access_token,
      expires_at: String(session.expires_at ?? ''),
    });
    window.open(`${KAMOSVET_URL}#${fragment.toString()}`, '_blank', 'noopener');
  };

  const grown = growth === null ? null : Math.round(growth * 100);

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-8 text-center flex flex-col items-center gap-5">
            <img src={mascotSearch} alt="" className="h-36 w-36 object-contain" loading="lazy" />
            <div>
              <h1 className="text-2xl font-bold">Kamosvět</h1>
              <p className="mt-2 text-muted-foreground max-w-md">
                Svět, který roste z toho, jak tady žiješ. Na začátku je prázdný —
                mlha a nic. Probouzí se tam, kde chodíš, a to, co se probudí, zůstane.
              </p>
            </div>

            {grown !== null && (
              <div className="w-full max-w-sm">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Kolik světa už máš</span>
                  <span>{grown} %</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${grown}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Roste z toho, co dáváš ostatním — ne z toho, co dostáváš.
                </p>
              </div>
            )}

            {KAMOSVET_URL ? (
              <Button size="lg" onClick={enter} disabled={!session} className="gap-2">
                {session ? <Compass className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                Vstoupit do Kamosvěta
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Dveře se otevřou, až bude svět připravený.</p>
            )}
          </div>
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Svet;
