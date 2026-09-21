import type { LucideIcon } from 'lucide-react';
import { Blocks, Bot, Brain, Crown, Gamepad2, MessageSquare, MousePointer2, Shield, Star, Volume2 } from 'lucide-react';
import { AIChatWindow } from './AIChatWindow';
import { AIChatbotModal } from './AIChatbotModal';
import { BrawlGame } from './BrawlGame';
import { ClickerGame } from './ClickerGame';
import { KamostavbaGame } from './KamostavbaGame';
import { MemoryGame } from './MemoryGame';
import { SnakeGame } from './SnakeGame';
import { TowerDefenseGame } from './TowerDefenseGame';
import { VIPPuzzleGame } from './VIPPuzzleGame';
import { VoiceAgentModal } from './VoiceAgentModal';

/**
 * Jeden seznam her a AI pro celou aplikaci.
 *
 * Dřív žil jen uvnitř plovoucího tlačítka na domovské stránce — hry a AI
 * jsou čtvrtina kódu a děti se k nim dostaly jen odtud. Teď ho sdílí
 * plovoucí menu i stránka Hry, a přibýt nová hra znamená přidat jeden řádek.
 */

export type GameId =
  | 'brawl' | 'snake' | 'tower' | 'memory' | 'clicker' | 'vip-puzzle' | 'kamostavba'
  | 'ai' | 'chatbot' | 'voice';

export interface GameItem {
  id: GameId;
  icon: LucideIcon;
  /** Klíč do i18n, nebo hotový název, když překlad neexistuje. */
  labelKey: string;
  /** Jednou větou, co to je — pro stránku Hry. */
  blurb: string;
  color: string;
  /** Hra, nebo AI kamarád? Na stránce Hry jsou zvlášť. */
  kind: 'game' | 'ai';
  vip?: boolean;
  /** Novinka — dostane štítek, ať si jí děti všimnou. */
  fresh?: boolean;
}

export const GAME_ITEMS: GameItem[] = [
  { id: 'kamostavba', icon: Blocks,     labelKey: 'Kamostavba',    blurb: 'Postav Kamosféru až k vlajce. Blok po bloku.', color: 'from-rose-500 to-amber-500',    kind: 'game', fresh: true },
  { id: 'brawl',   icon: Star,          labelKey: 'Brawlosféra',   blurb: 'Aréna. Kdo vydrží nejdýl?',                   color: 'from-amber-400 to-yellow-600', kind: 'game' },
  { id: 'snake',   icon: Gamepad2,      labelKey: 'fab.snake',     blurb: 'Klasika. Nesněz sám sebe.',                   color: 'from-green-500 to-emerald-600', kind: 'game' },
  { id: 'tower',   icon: Shield,        labelKey: 'fab.tower',     blurb: 'Postav věže, ubraň cestu.',                    color: 'from-orange-500 to-red-600',   kind: 'game' },
  { id: 'memory',  icon: Brain,         labelKey: 'fab.memory',    blurb: 'Najdi dvojice. Pamatuješ si, kde byla?',      color: 'from-blue-500 to-cyan-600',    kind: 'game' },
  { id: 'clicker', icon: MousePointer2, labelKey: 'fab.clicker',   blurb: 'Klikej. Pak klikej rychleji.',                color: 'from-yellow-500 to-orange-600', kind: 'game' },
  { id: 'vip-puzzle', icon: Crown,      labelKey: 'fab.vipPuzzle', blurb: 'Hádanka jen pro VIP.',                        color: 'from-amber-500 to-yellow-600', kind: 'game', vip: true },
  { id: 'chatbot', icon: MessageSquare, labelKey: 'fab.chatbot',   blurb: 'Zeptej se na cokoliv. Odpoví česky.',         color: 'from-teal-500 to-cyan-700',    kind: 'ai' },
  { id: 'ai',      icon: Bot,           labelKey: 'fab.ai',        blurb: 'Kamarád na povídání a nápady.',              color: 'from-violet-500 to-purple-600', kind: 'ai' },
  { id: 'voice',   icon: Volume2,       labelKey: 'fab.voice',     blurb: 'Mluv s ním nahlas. Odpoví hlasem.',           color: 'from-pink-500 to-rose-600',    kind: 'ai' },
];

interface GameModalsProps {
  active: GameId | null;
  onClose: () => void;
}

/** Všechna okna her na jednom místě; otevřené je to, jehož id je `active`. */
export function GameModals({ active, onClose }: GameModalsProps) {
  return (
    <>
      <AIChatWindow isOpen={active === 'ai'} onClose={onClose} />
      <AIChatbotModal isOpen={active === 'chatbot'} onClose={onClose} />
      <SnakeGame isOpen={active === 'snake'} onClose={onClose} />
      <TowerDefenseGame isOpen={active === 'tower'} onClose={onClose} />
      <MemoryGame isOpen={active === 'memory'} onClose={onClose} />
      <ClickerGame isOpen={active === 'clicker'} onClose={onClose} />
      <VIPPuzzleGame isOpen={active === 'vip-puzzle'} onClose={onClose} />
      <VoiceAgentModal isOpen={active === 'voice'} onClose={onClose} />
      <BrawlGame isOpen={active === 'brawl'} onClose={onClose} />
      <KamostavbaGame isOpen={active === 'kamostavba'} onClose={onClose} />
    </>
  );
}
