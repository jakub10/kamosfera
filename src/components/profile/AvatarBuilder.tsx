import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Shuffle, User, Shirt, Glasses, Sparkles } from 'lucide-react';

interface AvatarConfig {
  style: string;
  seed: string;
  hair: string;
  hairColor: string;
  skinColor: string;
  accessories: string;
  accessoriesColor: string;
  facialHair: string;
  facialHairColor: string;
  clothing: string;
  clothingColor: string;
  eyes: string;
  eyebrows: string;
  mouth: string;
  backgroundColor: string;
}

// Avataaars style options (more detailed and popular)
const HAIR_STYLES = [
  { id: 'dreads01', name: 'Dredy', emoji: '🧑‍🦱' },
  { id: 'dreads02', name: 'Dredy 2', emoji: '🧑‍🦱' },
  { id: 'frizzle', name: 'Kudrnaté', emoji: '👩‍🦱' },
  { id: 'shaggy', name: 'Rozcuchané', emoji: '🧔' },
  { id: 'curly', name: 'Vlnité', emoji: '👩‍🦱' },
  { id: 'bigHair', name: 'Velké', emoji: '💇‍♀️' },
  { id: 'bob', name: 'Mikádo', emoji: '👩' },
  { id: 'bun', name: 'Drdol', emoji: '👩‍🦰' },
  { id: 'longButNotTooLong', name: 'Polodlouhé', emoji: '🧑' },
  { id: 'miaWallace', name: 'Ofina', emoji: '💇‍♀️' },
  { id: 'straight01', name: 'Rovné 1', emoji: '👱‍♀️' },
  { id: 'straight02', name: 'Rovné 2', emoji: '👱‍♀️' },
  { id: 'shortFlat', name: 'Krátké rovné', emoji: '👨' },
  { id: 'shortWaved', name: 'Krátké vlnité', emoji: '👨‍🦱' },
  { id: 'shortCurly', name: 'Krátké kudrnaté', emoji: '👨‍🦱' },
  { id: 'shortRound', name: 'Krátké kulaté', emoji: '👦' },
  { id: 'sides', name: 'Po stranách', emoji: '👴' },
  { id: 'theCaesar', name: 'César', emoji: '👨' },
  { id: 'theCaesarAndSidePart', name: 'César s pěšinkou', emoji: '👨' },
];

const HAIR_COLORS = [
  { id: '2c1b18', name: 'Černá', color: '#2c1b18' },
  { id: '724133', name: 'Tmavě hnědá', color: '#724133' },
  { id: 'a55728', name: 'Hnědá', color: '#a55728' },
  { id: 'b58143', name: 'Světle hnědá', color: '#b58143' },
  { id: 'd6b370', name: 'Tmavá blond', color: '#d6b370' },
  { id: 'e8e1e1', name: 'Platinová', color: '#e8e1e1' },
  { id: 'ecdcbf', name: 'Blond', color: '#ecdcbf' },
  { id: 'c93305', name: 'Zrzavá', color: '#c93305' },
  { id: 'e24b4b', name: 'Červená', color: '#e24b4b' },
  { id: 'f59797', name: 'Růžová', color: '#f59797' },
  { id: '4a90d9', name: 'Modrá', color: '#4a90d9' },
  { id: 'a55eea', name: 'Fialová', color: '#a55eea' },
];

const SKIN_COLORS = [
  { id: 'ffdbb4', name: 'Světlá', color: '#ffdbb4' },
  { id: 'edb98a', name: 'Střední světlá', color: '#edb98a' },
  { id: 'd08b5b', name: 'Střední', color: '#d08b5b' },
  { id: 'ae5d29', name: 'Tmavší', color: '#ae5d29' },
  { id: '614335', name: 'Tmavá', color: '#614335' },
];

const EYES = [
  { id: 'default', name: 'Normální', emoji: '👁️' },
  { id: 'happy', name: 'Šťastné', emoji: '😊' },
  { id: 'wink', name: 'Mrkající', emoji: '😉' },
  { id: 'closed', name: 'Zavřené', emoji: '😌' },
  { id: 'squint', name: 'Přimhouřené', emoji: '😏' },
  { id: 'surprised', name: 'Překvapené', emoji: '😮' },
  { id: 'cry', name: 'Plačící', emoji: '😢' },
  { id: 'hearts', name: 'Srdíčka', emoji: '😍' },
  { id: 'side', name: 'Do strany', emoji: '👀' },
  { id: 'xDizzy', name: 'Závratě', emoji: '😵' },
  { id: 'winkWacky', name: 'Bláznivé', emoji: '🤪' },
];

const EYEBROWS = [
  { id: 'default', name: 'Normální', emoji: '😐' },
  { id: 'defaultNatural', name: 'Přirozené', emoji: '🙂' },
  { id: 'flatNatural', name: 'Ploché', emoji: '😑' },
  { id: 'raisedExcited', name: 'Vzrušené', emoji: '😃' },
  { id: 'raisedExcitedNatural', name: 'Nadšené', emoji: '🤩' },
  { id: 'sadConcerned', name: 'Smutné', emoji: '😟' },
  { id: 'sadConcernedNatural', name: 'Starostlivé', emoji: '😰' },
  { id: 'unibrowNatural', name: 'Srostlé', emoji: '🤨' },
  { id: 'upDown', name: 'Nahoru-dolů', emoji: '🧐' },
  { id: 'upDownNatural', name: 'Zvídavé', emoji: '🤔' },
  { id: 'angry', name: 'Naštvaný', emoji: '😠' },
  { id: 'angryNatural', name: 'Rozzlobený', emoji: '😡' },
];

const MOUTH = [
  { id: 'default', name: 'Normální', emoji: '😐' },
  { id: 'smile', name: 'Úsměv', emoji: '🙂' },
  { id: 'twinkle', name: 'Zářivý', emoji: '😊' },
  { id: 'serious', name: 'Vážný', emoji: '😑' },
  { id: 'tongue', name: 'Jazyk', emoji: '😛' },
  { id: 'grimace', name: 'Šklebení', emoji: '😬' },
  { id: 'sad', name: 'Smutný', emoji: '☹️' },
  { id: 'screamOpen', name: 'Křik', emoji: '😱' },
  { id: 'vomit', name: 'Nevolnost', emoji: '🤮' },
  { id: 'eating', name: 'Jídlo', emoji: '😋' },
  { id: 'disbelief', name: 'Nevěřící', emoji: '😦' },
  { id: 'concerned', name: 'Znepokojený', emoji: '😕' },
];

const FACIAL_HAIR = [
  { id: '', name: 'Žádné', emoji: '👶' },
  { id: 'beardLight', name: 'Lehký vous', emoji: '🧔' },
  { id: 'beardMedium', name: 'Střední vous', emoji: '🧔' },
  { id: 'beardMajestic', name: 'Plný vous', emoji: '🧔‍♂️' },
  { id: 'moustacheFancy', name: 'Knírek elegantní', emoji: '🥸' },
  { id: 'moustacheMagnum', name: 'Knírek Magnum', emoji: '👨' },
];

const ACCESSORIES = [
  { id: '', name: 'Žádné', emoji: '👤' },
  { id: 'prescription01', name: 'Brýle 1', emoji: '🤓' },
  { id: 'prescription02', name: 'Brýle 2', emoji: '👓' },
  { id: 'round', name: 'Kulaté brýle', emoji: '🧐' },
  { id: 'sunglasses', name: 'Sluneční brýle', emoji: '😎' },
  { id: 'wayfarers', name: 'Wayfarers', emoji: '🕶️' },
  { id: 'kurt', name: 'Kurt', emoji: '🎸' },
];

const CLOTHING = [
  { id: 'blazerAndShirt', name: 'Sako a košile', emoji: '🤵' },
  { id: 'blazerAndSweater', name: 'Sako a svetr', emoji: '👔' },
  { id: 'collarAndSweater', name: 'Límec a svetr', emoji: '🧥' },
  { id: 'graphicShirt', name: 'Tričko s grafikou', emoji: '👕' },
  { id: 'hoodie', name: 'Mikina', emoji: '🧥' },
  { id: 'overall', name: 'Montérky', emoji: '👷' },
  { id: 'shirtCrewNeck', name: 'Tričko', emoji: '👕' },
  { id: 'shirtScoopNeck', name: 'Triko s výstřihem', emoji: '👚' },
  { id: 'shirtVNeck', name: 'Triko do V', emoji: '👕' },
];

const CLOTHING_COLORS = [
  { id: '3c4f5c', name: 'Tmavě modrá', color: '#3c4f5c' },
  { id: '65c9ff', name: 'Světle modrá', color: '#65c9ff' },
  { id: '5199e4', name: 'Modrá', color: '#5199e4' },
  { id: '25557c', name: 'Námořní', color: '#25557c' },
  { id: '929598', name: 'Šedá', color: '#929598' },
  { id: 'e6e6e6', name: 'Světle šedá', color: '#e6e6e6' },
  { id: 'ffffff', name: 'Bílá', color: '#ffffff' },
  { id: 'ff5c5c', name: 'Červená', color: '#ff5c5c' },
  { id: 'ffafb9', name: 'Růžová', color: '#ffafb9' },
  { id: 'ffdeb5', name: 'Béžová', color: '#ffdeb5' },
  { id: 'ff488e', name: 'Magenta', color: '#ff488e' },
  { id: '262e33', name: 'Černá', color: '#262e33' },
];

const BACKGROUND_COLORS = [
  { id: 'b6e3f4', name: 'Světle modrá', color: '#b6e3f4' },
  { id: 'c0aede', name: 'Levandulová', color: '#c0aede' },
  { id: 'd1d4f9', name: 'Světle fialová', color: '#d1d4f9' },
  { id: 'ffd5dc', name: 'Růžová', color: '#ffd5dc' },
  { id: 'ffdfbf', name: 'Broskvová', color: '#ffdfbf' },
  { id: 'ffeebb', name: 'Žlutá', color: '#ffeebb' },
  { id: 'c1f0c1', name: 'Světle zelená', color: '#c1f0c1' },
  { id: 'ffffff', name: 'Bílá', color: '#ffffff' },
  { id: 'transparent', name: 'Průhledná', color: 'transparent' },
];

const defaultConfig: AvatarConfig = {
  style: 'avataaars',
  seed: '',
  hair: 'shortFlat',
  hairColor: 'a55728',
  skinColor: 'edb98a',
  accessories: '',
  accessoriesColor: '4b4b4b',
  facialHair: '',
  facialHairColor: '2c1b18',
  clothing: 'shirtCrewNeck',
  clothingColor: '5199e4',
  eyes: 'default',
  eyebrows: 'default',
  mouth: 'smile',
  backgroundColor: 'b6e3f4',
};

export function AvatarBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<AvatarConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'hair' | 'face' | 'clothing' | 'extras'>('hair');

  useEffect(() => {
    const fetchConfig = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('avatar_config')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data?.avatar_config && typeof data.avatar_config === 'object') {
        const configData = data.avatar_config as Record<string, unknown>;
        // Staré uložené hodnoty, které DiceBear nezná (César, zavřené oči).
        const RENAMED: Record<string, string> = { caesar: 'theCaesar', close: 'closed' };
        setConfig(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(configData).map(([k, v]) => [k, RENAMED[String(v ?? '')] ?? String(v ?? '')])
          )
        } as AvatarConfig));
      }
      setLoading(false);
    };
    fetchConfig();
  }, [user]);

  const getAvatarUrl = (cfg: AvatarConfig, size = 200) => {
    const params = new URLSearchParams();
    params.set('seed', cfg.seed || user?.id || 'default');
    
    // Hair - DiceBear v7.x avataaars parameters
    params.set('top', cfg.hair);
    params.set('hairColor', cfg.hairColor);
    
    // Skin
    params.set('skinColor', cfg.skinColor);
    
    // Face - use correct v7.x parameter names
    params.set('eyes', cfg.eyes);
    params.set('eyebrows', cfg.eyebrows);
    params.set('mouth', cfg.mouth);
    
    // Clothing - correct v7.x parameters
    params.set('clothing', cfg.clothing);
    params.set('clothesColor', cfg.clothingColor);
    
    // Accessories - omit if empty
    // DiceBear jinak doplňky i vousy kreslí jen v 10 % případů.
    if (cfg.accessories) {
      params.set('accessories', cfg.accessories);
      params.set('accessoriesProbability', '100');
    } else {
      params.set('accessoriesProbability', '0');
    }
    
    // Facial hair - omit if empty
    if (cfg.facialHair) {
      params.set('facialHair', cfg.facialHair);
      params.set('facialHairColor', cfg.facialHairColor);
      params.set('facialHairProbability', '100');
    } else {
      params.set('facialHairProbability', '0');
    }
    
    // Background
    if (cfg.backgroundColor && cfg.backgroundColor !== 'transparent') {
      params.set('backgroundColor', cfg.backgroundColor);
    }
    
    params.set('size', size.toString());
    
    return `https://api.dicebear.com/7.x/avataaars/svg?${params.toString()}`;
  };

  const handleRandomize = () => {
    const randomChoice = <T extends { id: string }>(arr: T[]): string => 
      arr[Math.floor(Math.random() * arr.length)].id;
    
    setConfig({
      style: 'avataaars',
      seed: Math.random().toString(36).substring(7),
      hair: randomChoice(HAIR_STYLES),
      hairColor: randomChoice(HAIR_COLORS),
      skinColor: randomChoice(SKIN_COLORS),
      eyes: randomChoice(EYES),
      eyebrows: randomChoice(EYEBROWS),
      mouth: randomChoice(MOUTH),
      facialHair: Math.random() > 0.5 ? randomChoice(FACIAL_HAIR) : '',
      facialHairColor: randomChoice(HAIR_COLORS),
      accessories: Math.random() > 0.6 ? randomChoice(ACCESSORIES) : '',
      accessoriesColor: '4b4b4b',
      clothing: randomChoice(CLOTHING),
      clothingColor: randomChoice(CLOTHING_COLORS),
      backgroundColor: randomChoice(BACKGROUND_COLORS),
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const avatarUrl = getAvatarUrl(config);

    const { error } = await supabase
      .from('profiles')
      .update({ 
        avatar_config: config as unknown as Record<string, string>,
        avatar_url: avatarUrl
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se uložit avatar.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Uloženo! ✨',
        description: 'Tvůj avatar byl aktualizován.',
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const ColorPicker = ({ 
    colors, 
    selected, 
    onChange 
  }: { 
    colors: { id: string; name: string; color: string }[]; 
    selected: string; 
    onChange: (id: string) => void;
  }) => (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          title={c.name}
          className={`w-9 h-9 rounded-full border-2 transition-all shadow-sm hover:scale-110 ${
            selected === c.id 
              ? 'border-primary ring-2 ring-primary/30 scale-110' 
              : 'border-border hover:border-primary/50'
          }`}
          style={{ 
            backgroundColor: c.color === 'transparent' ? 'transparent' : c.color,
            backgroundImage: c.color === 'transparent' 
              ? 'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)'
              : 'none',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
          }}
        />
      ))}
    </div>
  );

  const OptionGrid = ({ 
    options, 
    selected, 
    onChange,
    showPreview = false
  }: { 
    options: { id: string; name: string; emoji?: string }[];
    selected: string;
    onChange: (id: string) => void;
    showPreview?: boolean;
  }) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {options.map((opt) => (
        <button
          key={opt.id || 'none'}
          onClick={() => onChange(opt.id)}
          className={`p-2 rounded-xl border-2 transition-all text-center ${
            selected === opt.id
              ? 'border-primary bg-primary/10 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          {opt.emoji && <span className="text-xl block mb-1">{opt.emoji}</span>}
          <span className="text-xs font-medium block truncate">{opt.name}</span>
        </button>
      ))}
    </div>
  );

  const tabs = [
    { id: 'hair' as const, label: 'Vlasy', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'face' as const, label: 'Obličej', icon: <User className="h-4 w-4" /> },
    { id: 'clothing' as const, label: 'Oblečení', icon: <Shirt className="h-4 w-4" /> },
    { id: 'extras' as const, label: 'Doplňky', icon: <Glasses className="h-4 w-4" /> },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-2xl">🎨</span>
              Vytvoř si avatar
            </CardTitle>
            <CardDescription>Přizpůsob si svůj jedinečný vzhled</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRandomize} className="gap-2">
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Náhodný</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="hidden sm:inline">Uložit</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Avatar Preview - Sticky on large screens */}
          <div className="lg:col-span-2 p-6 flex flex-col items-center justify-center bg-gradient-to-br from-muted/50 to-background border-b lg:border-b-0 lg:border-r">
            <div 
              className="w-40 h-40 lg:w-56 lg:h-56 rounded-full overflow-hidden shadow-xl ring-4 ring-background"
              style={{ 
                backgroundColor: config.backgroundColor === 'transparent' 
                  ? 'hsl(var(--muted))' 
                  : `#${config.backgroundColor}`
              }}
            >
              <img
                src={getAvatarUrl(config, 256)}
                alt="Avatar preview"
                className="w-full h-full"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-4">Náhled avataru</p>
          </div>

          {/* Customization Options */}
          <div className="lg:col-span-3 flex flex-col">
            {/* Tab Navigation */}
            <div className="flex border-b bg-muted/30">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-primary bg-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <ScrollArea className="h-[500px] lg:h-[600px]">
              <div className="p-4 space-y-5">
                {activeTab === 'hair' && (
                  <>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Účes</Label>
                      <OptionGrid 
                        options={HAIR_STYLES} 
                        selected={config.hair} 
                        onChange={(id) => setConfig(c => ({ ...c, hair: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Barva vlasů</Label>
                      <ColorPicker 
                        colors={HAIR_COLORS} 
                        selected={config.hairColor} 
                        onChange={(id) => setConfig(c => ({ ...c, hairColor: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Vousy</Label>
                      <OptionGrid 
                        options={FACIAL_HAIR} 
                        selected={config.facialHair} 
                        onChange={(id) => setConfig(c => ({ ...c, facialHair: id }))} 
                      />
                    </div>
                    {config.facialHair && (
                      <div>
                        <Label className="text-sm font-semibold mb-3 block">Barva vousů</Label>
                        <ColorPicker 
                          colors={HAIR_COLORS} 
                          selected={config.facialHairColor} 
                          onChange={(id) => setConfig(c => ({ ...c, facialHairColor: id }))} 
                        />
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'face' && (
                  <>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Barva pleti</Label>
                      <ColorPicker 
                        colors={SKIN_COLORS} 
                        selected={config.skinColor} 
                        onChange={(id) => setConfig(c => ({ ...c, skinColor: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Oči</Label>
                      <OptionGrid 
                        options={EYES} 
                        selected={config.eyes} 
                        onChange={(id) => setConfig(c => ({ ...c, eyes: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Obočí</Label>
                      <OptionGrid 
                        options={EYEBROWS} 
                        selected={config.eyebrows} 
                        onChange={(id) => setConfig(c => ({ ...c, eyebrows: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Ústa</Label>
                      <OptionGrid 
                        options={MOUTH} 
                        selected={config.mouth} 
                        onChange={(id) => setConfig(c => ({ ...c, mouth: id }))} 
                      />
                    </div>
                  </>
                )}

                {activeTab === 'clothing' && (
                  <>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Typ oblečení</Label>
                      <OptionGrid 
                        options={CLOTHING} 
                        selected={config.clothing} 
                        onChange={(id) => setConfig(c => ({ ...c, clothing: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Barva oblečení</Label>
                      <ColorPicker 
                        colors={CLOTHING_COLORS} 
                        selected={config.clothingColor} 
                        onChange={(id) => setConfig(c => ({ ...c, clothingColor: id }))} 
                      />
                    </div>
                  </>
                )}

                {activeTab === 'extras' && (
                  <>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Doplňky</Label>
                      <OptionGrid 
                        options={ACCESSORIES} 
                        selected={config.accessories} 
                        onChange={(id) => setConfig(c => ({ ...c, accessories: id }))} 
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold mb-3 block">Barva pozadí</Label>
                      <ColorPicker 
                        colors={BACKGROUND_COLORS} 
                        selected={config.backgroundColor} 
                        onChange={(id) => setConfig(c => ({ ...c, backgroundColor: id }))} 
                      />
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
