import { useState } from 'react';
import { Sparkles, Palette, Check, Lock, Crown, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { KAMOS_STICKERS } from '@/lib/stickers';

export type PostBackgroundStyle = 
  | 'gradient-purple' 
  | 'gradient-blue' 
  | 'gradient-sunset' 
  | 'gradient-ocean'
  | 'gradient-forest'
  | 'gradient-fire'
  | 'gradient-galaxy'
  | 'gradient-aurora'
  | 'pattern-dots'
  | 'pattern-stars'
  | 'pattern-hearts'
  | 'animated-gradient'
  | 'animated-pulse'
  | 'animated-shimmer'
  | 'animated-rainbow'
  | 'animated-wave'
  | null;

// Base backgrounds (free for VIP)
export const VIP_BACKGROUNDS: { id: PostBackgroundStyle; name: string; className: string; animated?: boolean; cost?: number }[] = [
  { id: null, name: 'Žádné', className: 'bg-card', cost: 0 },
  { id: 'gradient-purple', name: 'Fialový gradient', className: 'bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-purple-600/20', cost: 0 },
  { id: 'gradient-blue', name: 'Modrý gradient', className: 'bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-blue-600/20', cost: 0 },
  { id: 'gradient-sunset', name: 'Západ slunce', className: 'bg-gradient-to-br from-orange-500/20 via-red-500/20 to-pink-500/20', cost: 0 },
  { id: 'gradient-ocean', name: 'Oceán', className: 'bg-gradient-to-br from-cyan-500/20 via-teal-500/20 to-emerald-500/20', cost: 0 },
  { id: 'gradient-forest', name: 'Les', className: 'bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-teal-500/20', cost: 0 },
  { id: 'gradient-fire', name: 'Oheň', className: 'bg-gradient-to-br from-red-500/20 via-orange-500/20 to-yellow-500/20', cost: 0 },
  { id: 'gradient-galaxy', name: 'Galaxie', className: 'bg-gradient-to-br from-indigo-600/25 via-purple-600/20 to-pink-500/25', cost: 50 },
  { id: 'gradient-aurora', name: 'Polární záře', className: 'bg-gradient-to-br from-green-400/20 via-blue-500/20 to-purple-600/20', cost: 50 },
  { id: 'pattern-dots', name: 'Tečky', className: 'bg-card bg-[radial-gradient(circle,hsl(var(--primary)/0.1)_1px,transparent_1px)] bg-[size:12px_12px]', cost: 0 },
  { id: 'pattern-stars', name: 'Hvězdy', className: 'bg-card bg-[radial-gradient(2px_2px_at_20px_30px,hsl(var(--primary)/0.3),transparent),radial-gradient(2px_2px_at_40px_70px,hsl(var(--primary)/0.2),transparent),radial-gradient(1px_1px_at_90px_40px,hsl(var(--primary)/0.3),transparent),radial-gradient(2px_2px_at_130px_80px,hsl(var(--primary)/0.2),transparent)]', cost: 0 },
  { id: 'pattern-hearts', name: 'Srdíčka', className: 'bg-card', cost: 25 },
  // Animated backgrounds (premium)
  { id: 'animated-gradient', name: '✨ Živý gradient', className: 'vip-animated-gradient', animated: true, cost: 100 },
  { id: 'animated-pulse', name: '💫 Pulzující', className: 'vip-animated-pulse', animated: true, cost: 100 },
  { id: 'animated-shimmer', name: '🌟 Třpytivý', className: 'vip-animated-shimmer', animated: true, cost: 150 },
  { id: 'animated-rainbow', name: '🌈 Duhový', className: 'vip-animated-rainbow', animated: true, cost: 200 },
  { id: 'animated-wave', name: '🌊 Vlnový', className: 'vip-animated-wave', animated: true, cost: 150 },
];

// VIP exclusive image emojis - actual image URLs (not text characters)
export interface VipEmoji {
  id: string;
  name: string;
  url: string;
  cost: number;
  /** Vlastní nálepka Kamosféry (větší, v telefonu ji nenajdeš). */
  sticker?: boolean;
}

/** Starší obrázková emoji (z telefonu). V obchodě už nejsou, kdo je koupil, má je dál. */
const PHONE_EMOJIS: VipEmoji[] = [
  { id: 'star-gold', name: 'Zlatá hvězda', url: 'https://em-content.zobj.net/source/apple/391/star_2b50.png', cost: 0 },
  { id: 'crown', name: 'Koruna', url: 'https://em-content.zobj.net/source/apple/391/crown_1f451.png', cost: 0 },
  { id: 'diamond', name: 'Diamant', url: 'https://em-content.zobj.net/source/apple/391/gem-stone_1f48e.png', cost: 0 },
  { id: 'fire', name: 'Oheň', url: 'https://em-content.zobj.net/source/apple/391/fire_1f525.png', cost: 0 },
  { id: 'rocket', name: 'Raketa', url: 'https://em-content.zobj.net/source/apple/391/rocket_1f680.png', cost: 0 },
  { id: 'rainbow', name: 'Duha', url: 'https://em-content.zobj.net/source/apple/391/rainbow_1f308.png', cost: 25 },
  { id: 'unicorn', name: 'Jednorožec', url: 'https://em-content.zobj.net/source/apple/391/unicorn_1f984.png', cost: 25 },
  { id: 'butterfly', name: 'Motýl', url: 'https://em-content.zobj.net/source/apple/391/butterfly_1f98b.png', cost: 25 },
  { id: 'heart-fire', name: 'Srdce v plamenech', url: 'https://em-content.zobj.net/source/apple/391/heart-on-fire_2764-fe0f-200d-1f525.png', cost: 50 },
  { id: 'sparkles', name: 'Třpytky', url: 'https://em-content.zobj.net/source/apple/391/sparkles_2728.png', cost: 0 },
  { id: 'crystal-ball', name: 'Křišťálová koule', url: 'https://em-content.zobj.net/source/apple/391/crystal-ball_1f52e.png', cost: 50 },
  { id: 'shooting-star', name: 'Padající hvězda', url: 'https://em-content.zobj.net/source/apple/391/shooting-star_1f320.png', cost: 50 },
  { id: 'glowing-star', name: 'Zářící hvězda', url: 'https://em-content.zobj.net/source/apple/391/glowing-star_1f31f.png', cost: 0 },
  { id: 'party', name: 'Párty', url: 'https://em-content.zobj.net/source/apple/391/party-popper_1f389.png', cost: 0 },
  { id: 'confetti', name: 'Konfety', url: 'https://em-content.zobj.net/source/apple/391/confetti-ball_1f38a.png', cost: 25 },
  { id: 'trophy', name: 'Trofej', url: 'https://em-content.zobj.net/source/apple/391/trophy_1f3c6.png', cost: 75 },
  { id: 'medal', name: 'Medaile', url: 'https://em-content.zobj.net/source/apple/391/1st-place-medal_1f947.png', cost: 75 },
  { id: 'cool', name: 'Cool', url: 'https://em-content.zobj.net/source/apple/391/smiling-face-with-sunglasses_1f60e.png', cost: 0 },
  { id: 'nerd', name: 'Nerd', url: 'https://em-content.zobj.net/source/apple/391/nerd-face_1f913.png', cost: 25 },
  { id: 'angel', name: 'Anděl', url: 'https://em-content.zobj.net/source/apple/391/smiling-face-with-halo_1f607.png', cost: 50 },
  { id: 'alien', name: 'Mimozemšťan', url: 'https://em-content.zobj.net/source/apple/391/alien_1f47d.png', cost: 75 },
  { id: 'robot', name: 'Robot', url: 'https://em-content.zobj.net/source/apple/391/robot_1f916.png', cost: 75 },
  { id: 'cat-heart', name: 'Kočka srdce', url: 'https://em-content.zobj.net/source/apple/391/smiling-cat-with-heart-eyes_1f63b.png', cost: 50 },
  { id: 'dragon', name: 'Drak', url: 'https://em-content.zobj.net/source/apple/391/dragon-face_1f432.png', cost: 100 },
  { id: 'phoenix', name: 'Fénix', url: 'https://em-content.zobj.net/source/apple/391/phoenix_1f426-200d-1f525.png', cost: 150 },
  { id: 'gaming', name: 'Hry', url: 'https://em-content.zobj.net/source/apple/391/video-game_1f3ae.png', cost: 0 },
  { id: 'music', name: 'Hudba', url: 'https://em-content.zobj.net/source/apple/391/musical-notes_1f3b6.png', cost: 0 },
  { id: 'pizza', name: 'Pizza', url: 'https://em-content.zobj.net/source/apple/391/pizza_1f355.png', cost: 25 },
  { id: 'ice-cream', name: 'Zmrzlina', url: 'https://em-content.zobj.net/source/apple/391/ice-cream_1f368.png', cost: 25 },
  { id: 'rainbow-flag', name: 'Duhová vlajka', url: 'https://em-content.zobj.net/source/apple/391/rainbow-flag_1f3f3-fe0f-200d-1f308.png', cost: 100 },
];

export const VIP_IMAGE_EMOJIS: VipEmoji[] = [...KAMOS_STICKERS, ...PHONE_EMOJIS];

export function getBackgroundClass(style: PostBackgroundStyle): string {
  const bg = VIP_BACKGROUNDS.find(b => b.id === style);
  return bg?.className || 'bg-card';
}

interface VIPBackgroundPickerProps {
  selectedBackground: PostBackgroundStyle;
  onSelect: (style: PostBackgroundStyle) => void;
  userPoints?: number;
  unlockedBackgrounds?: string[];
}

export function VIPBackgroundPicker({ 
  selectedBackground, 
  onSelect, 
  userPoints = 0,
  unlockedBackgrounds = [] 
}: VIPBackgroundPickerProps) {
  const [open, setOpen] = useState(false);

  const isUnlocked = (bg: typeof VIP_BACKGROUNDS[0]) => {
    if (!bg.cost || bg.cost === 0) return true;
    return unlockedBackgrounds.includes(bg.id || '');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
        >
          <Palette className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
              <Sparkles className="h-4 w-4" />
              VIP Pozadí příspěvku
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Crown className="h-3 w-3 text-amber-500" />
              {userPoints} bodů
            </div>
          </div>
          
          {/* Regular backgrounds */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Základní</p>
            <div className="grid grid-cols-4 gap-2">
              {VIP_BACKGROUNDS.filter(bg => !bg.animated && (!bg.cost || bg.cost === 0)).map((bg) => (
                <button
                  key={bg.id || 'none'}
                  onClick={() => {
                    onSelect(bg.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative h-10 rounded-lg border-2 transition-all",
                    bg.className,
                    selectedBackground === bg.id
                      ? "border-amber-500 ring-2 ring-amber-500/30"
                      : "border-border hover:border-amber-500/50"
                  )}
                  title={bg.name}
                >
                  {selectedBackground === bg.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-3 w-3 text-amber-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Premium backgrounds */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Premium (odemkni v obchodě)</p>
            <div className="grid grid-cols-4 gap-2">
              {VIP_BACKGROUNDS.filter(bg => bg.cost && bg.cost > 0).map((bg) => {
                const unlocked = isUnlocked(bg);
                return (
                  <button
                    key={bg.id}
                    onClick={() => {
                      if (unlocked) {
                        onSelect(bg.id);
                        setOpen(false);
                      }
                    }}
                    disabled={!unlocked}
                    className={cn(
                      "relative h-10 rounded-lg border-2 transition-all",
                      bg.className,
                      !unlocked && "opacity-50 cursor-not-allowed",
                      selectedBackground === bg.id
                        ? "border-amber-500 ring-2 ring-amber-500/30"
                        : "border-border hover:border-amber-500/50"
                    )}
                    title={`${bg.name} (${bg.cost} bodů)`}
                  >
                    {!unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                        <Lock className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {selectedBackground === bg.id && unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="h-3 w-3 text-amber-500" />
                      </div>
                    )}
                    {bg.animated && (
                      <div className="absolute -top-1 -right-1">
                        <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface VIPEmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  userPoints?: number;
  unlockedEmojis?: string[];
}

export function VIPEmojiPicker({ 
  onEmojiSelect, 
  userPoints = 0,
  unlockedEmojis = [] 
}: VIPEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const isUnlocked = (emoji: VipEmoji) => {
    if (emoji.cost === 0) return true;
    return unlockedEmojis.includes(emoji.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
              <Star className="h-4 w-4" />
              VIP Obrázkové Emoji
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Crown className="h-3 w-3 text-amber-500" />
              {userPoints} bodů
            </div>
          </div>
          
          {/* Nálepky Kamosféry */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Nálepky Kamosféry 🤖</p>
            <div className="grid grid-cols-5 gap-1.5">
              {KAMOS_STICKERS.map((st) => {
                const unlocked = isUnlocked(st);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      if (!unlocked) return;
                      onEmojiSelect(`[img:${st.id}]`);
                      setOpen(false);
                    }}
                    disabled={!unlocked}
                    className={cn(
                      'relative h-12 w-12 rounded-lg transition-colors',
                      unlocked ? 'hover:bg-amber-500/10' : 'cursor-not-allowed opacity-50'
                    )}
                    title={unlocked ? st.name : `${st.name} (${st.cost} bodů v obchodě)`}
                  >
                    <StickerImage url={st.url} name={st.name} className="h-11 w-11" />
                    {!unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                        <Lock className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Základní a dřív koupená emoji */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Emoji</p>
            <div className="grid grid-cols-6 gap-1.5">
              {PHONE_EMOJIS.filter((e) => isUnlocked(e)).map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => {
                    onEmojiSelect(`[img:${emoji.id}]`);
                    setOpen(false);
                  }}
                  className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-amber-500/10 transition-colors"
                  title={emoji.name}
                >
                  <StickerImage url={emoji.url} name={emoji.name} className="h-7 w-7" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Obrázek, který nejde jednoduše zkopírovat: není to <img>, takže ho nejde
 * přetáhnout, „Uložit obrázek jako…" ani zkopírovat s textem příspěvku.
 * (Snímek obrazovky zastavit nejde — to žádná aplikace neumí.)
 */
export function StickerImage({ url, name, className }: { url: string; name: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={cn('inline-block select-none bg-contain bg-center bg-no-repeat [-webkit-touch-callout:none] [-webkit-user-drag:none]', className)}
      style={{ backgroundImage: `url("${url}")` }}
    />
  );
}

// Render VIP image emojis in text
export function renderVIPEmojis(text: string): React.ReactNode[] {
  const regex = /\[img:([a-z-]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const emoji = VIP_IMAGE_EMOJIS.find((e) => e.id === match![1]);
    if (emoji) {
      parts.push(
        <StickerImage
          key={match.index}
          url={emoji.url}
          name={emoji.name}
          className={
            emoji.sticker
              ? 'mx-0.5 h-20 w-20 rounded-2xl bg-white align-middle shadow-sm ring-1 ring-black/5'
              : 'mx-0.5 h-5 w-5 align-text-bottom'
          }
        />
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// VIP badge component
export function VIPBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-500 border border-amber-500/30",
      className
    )}>
      <Sparkles className="h-3 w-3" />
      VIP
    </span>
  );
}

// Creator badge component
export function CreatorBadge({ className }: { className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-500 border border-purple-500/30",
      className
    )}>
      <Crown className="h-3 w-3" />
      Tvůrce
    </span>
  );
}
