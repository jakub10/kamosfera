import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { GAME_ITEMS, GameModals, type GameId, type GameItem } from '@/components/games/gameCatalog';
import { cn } from '@/lib/utils';
import mascotGaming from '@/assets/mascot-gaming.png';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Stránka Hry.
 *
 * Hry a AI kamarád byli schovaní v jedné plovoucí bublině na domovské stránce,
 * devět položek vedle sebe. Tady má každá hra svou kartu a AI je zvlášť,
 * protože to není hra.
 */
const Games = () => {
  const { user } = useAuth();
  const { isVIP, isCreator } = useUserRole();
  const { t } = useTranslation();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [active, setActive] = useState<GameId | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setCurrentProfile(data));
  }, [user]);

  const canPlayVip = isVIP || isCreator;
  const label = (item: GameItem) => (item.labelKey.includes('.') ? t(item.labelKey) : item.labelKey);

  const games = GAME_ITEMS.filter((g) => g.kind === 'game' && (!g.vip || canPlayVip));
  const ai = GAME_ITEMS.filter((g) => g.kind === 'ai');

  const Card = ({ item }: { item: GameItem }) => {
    const Icon = item.icon;
    return (
      <button
        type="button"
        onClick={() => setActive(item.id)}
        className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow',
            item.color
          )}
        >
          <Icon className="h-7 w-7" />
          {item.vip && (
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400">
              <Crown className="h-3 w-3 text-amber-900" />
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{label(item)}</span>
          <span className="block text-sm text-muted-foreground">{item.blurb}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <header className="flex items-center gap-4">
            <img src={mascotGaming} alt="" className="h-20 w-20 object-contain" loading="lazy" />
            <div>
              <h1 className="text-2xl font-bold">Hry</h1>
              <p className="text-muted-foreground">Chvilka na oddech. Nebo na rekord.</p>
            </div>
          </header>

          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {games.map((g) => <Card key={g.id} item={g} />)}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">AI kamarád</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ai.map((g) => <Card key={g.id} item={g} />)}
            </div>
          </section>
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
      <GameModals active={active} onClose={() => setActive(null)} />
    </div>
  );
};

export default Games;
