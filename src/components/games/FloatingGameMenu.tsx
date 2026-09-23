import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Gamepad2, Brain, MousePointer2, Crown, Volume2, Shield, MessageSquare, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';

import { GAME_ITEMS, GameModals, type GameId } from './gameCatalog';

type ActiveModal = 'none' | GameId;

export function FloatingGameMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const { isVIP, isCreator } = useUserRole();
  const { t } = useTranslation();

  // Jeden sdílený seznam se stránkou Hry (gameCatalog.tsx).
  const menuItems = GAME_ITEMS
    .filter((g) => !g.vip || isVIP || isCreator)
    .map((g) => ({ ...g, label: g.labelKey.includes('.') ? t(g.labelKey) : g.labelKey }));

  const navigate = useNavigate();

  const handleItemClick = (id: ActiveModal) => {
    setIsOpen(false);
    const href = GAME_ITEMS.find((g) => g.id === id)?.href;
    if (href) navigate(href);
    else setActiveModal(id);
  };

  return (
    <>
      {/* Menu Items */}
      <div className={cn(
        "fixed bottom-44 right-4 md:bottom-[6.5rem] md:right-6 z-[60] transition-all duration-300",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}>
        <div className="grid grid-cols-2 gap-3 mb-3 justify-items-end">
          {[...menuItems].reverse().map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={cn(
                "w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 hover:scale-110 relative bg-gradient-to-br",
                item.color,
                isOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              )}
              style={{ transitionDelay: isOpen ? `${index * 50}ms` : '0ms' }}
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
              {'vip' in item && item.vip && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
                  <Crown className="h-2.5 w-2.5 text-amber-900" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main FAB Button with animated lines */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[55] w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label={isOpen ? 'Zavřít rychlé menu' : 'Otevřít rychlé menu'}
      >
        <div className="relative w-6 h-6 flex flex-col justify-center items-center">
          <span
            className={cn(
              "absolute h-0.5 w-6 bg-current transition-all duration-300 rounded-full",
              isOpen ? "rotate-45" : "-translate-y-1.5"
            )}
          />
          <span
            className={cn(
              "absolute h-0.5 w-6 bg-current transition-all duration-300 rounded-full",
              isOpen ? "-rotate-45" : "translate-y-1.5"
            )}
          />
        </div>
      </button>

      <GameModals active={activeModal === 'none' ? null : activeModal} onClose={() => setActiveModal('none')} />
    </>
  );
}