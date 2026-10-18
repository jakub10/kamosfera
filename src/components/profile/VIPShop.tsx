import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, Sparkles, Palette, Crown, Check, Lock, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useTranslation } from 'react-i18next';
import { StickerImage, VIP_BACKGROUNDS } from '@/components/social/VIPPostFeatures';
import { KAMOS_STICKERS } from '@/lib/stickers';
import { cn } from '@/lib/utils';

interface UserShopData {
  total_points: number;
  unlocked_items: string[];
}

export function VIPShop() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isVIP, isVipProMax } = useUserRole();
  const { t } = useTranslation();
  const [userData, setUserData] = useState<UserShopData>({ total_points: 0, unlocked_items: [] });
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // VIP PRO MAX gets everything free, VIP gets 50% discount
  const getEffectiveCost = (cost: number) => isVipProMax ? 0 : isVIP ? Math.ceil(cost / 2) : cost;

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      const [{ data: stats }, { data: items }] = await Promise.all([
        supabase.from('user_stats').select('total_points').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_unlocked_items').select('item_id').eq('user_id', user.id),
      ]);

      setUserData({
        total_points: stats?.total_points || 0,
        unlocked_items: (items || []).map((r: { item_id: string }) => r.item_id),
      });
      setLoading(false);
    };

    fetchUserData();
  }, [user]);

  const purchaseItem = async (itemId: string, cost: number, type: 'background' | 'emoji') => {
    if (!user) return;
    if (userData.total_points < cost) {
      toast({
        title: 'Nedostatek bodů',
        description: `Potřebuješ ${cost} bodů, ale máš jen ${userData.total_points}.`,
        variant: 'destructive',
      });
      return;
    }

    setPurchasing(itemId);

    try {
      const { data, error } = await supabase.rpc('purchase_vip_item', {
        _item_id: itemId,
        _item_type: type,
      });

      if (error) throw error;

      const result = data as { ok: boolean; new_balance?: number; already_owned?: boolean };
      const newPoints = result.new_balance ?? userData.total_points;
      const newUnlocked = userData.unlocked_items.includes(itemId)
        ? userData.unlocked_items
        : [...userData.unlocked_items, itemId];

      setUserData({ total_points: newPoints, unlocked_items: newUnlocked });

      toast({
        title: '🎉 Zakoupeno!',
        description: `Úspěšně jsi odemkl(a) novou položku za ${cost} bodů.`,
      });
    } catch (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se zakoupit položku.',
        variant: 'destructive',
      });
    } finally {
      setPurchasing(null);
    }
  };

  const isOwned = (itemId: string) => userData.unlocked_items.includes(itemId);

  const premiumBackgrounds = VIP_BACKGROUNDS.filter(bg => bg.cost && bg.cost > 0);
  // V obchodě jsou jen vlastní nálepky Kamosféry — emoji z telefonu má každý zadarmo.
  const premiumEmojis = KAMOS_STICKERS.filter(e => e.cost > 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-amber-500" />
              {t('shop.title')}
              {isVIP && <Badge className="bg-amber-500 text-white">VIP -50%</Badge>}
            </CardTitle>
            <CardDescription>
              {t('shop.subtitle')}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2 bg-amber-500/10 text-amber-500 border-amber-500/30">
            <Crown className="h-4 w-4 mr-2" />
            {userData.total_points} {t('shop.points')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="backgrounds">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="backgrounds" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t('shop.backgrounds')}
            </TabsTrigger>
            <TabsTrigger value="emojis" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('shop.emojis')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backgrounds" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {premiumBackgrounds.map((bg) => {
                const owned = isOwned(bg.id || '');
                const effectiveCost = getEffectiveCost(bg.cost || 0);
                const canAfford = userData.total_points >= effectiveCost;
                
                return (
                  <div
                    key={bg.id}
                    className={cn(
                      "relative rounded-xl border-2 p-4 transition-all",
                      owned ? "border-green-500/50 bg-green-500/5" : "border-border",
                      !owned && canAfford && "hover:border-amber-500/50"
                    )}
                  >
                    <div className={cn(
                      "h-24 rounded-lg mb-3 flex items-center justify-center",
                      bg.className
                    )}>
                      {bg.animated && (
                        <div className="flex items-center gap-2 text-sm text-amber-500">
                          <Sparkles className="h-4 w-4 animate-pulse" />
                          ✨
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-medium truncate">{bg.name}</h4>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Star className="h-3 w-3 text-amber-500" />
                          {isVIP && (bg.cost || 0) > 0 ? (
                            <>
                              <span className="line-through opacity-60">{bg.cost}</span>
                              <span className="text-amber-500 font-semibold">{effectiveCost}</span>
                            </>
                          ) : (
                            <span>{effectiveCost}</span>
                          )}
                          <span>{t('shop.points')}</span>
                        </div>
                      </div>
                      
                      {owned ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30 shrink-0">
                          <Check className="h-3 w-3 mr-1" />
                          {t('shop.owned')}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!canAfford || purchasing === bg.id}
                          onClick={() => purchaseItem(bg.id || '', effectiveCost, 'background')}
                          className={cn("shrink-0",
                            canAfford 
                              ? "bg-amber-500 hover:bg-amber-600" 
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {purchasing === bg.id ? (
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : !canAfford ? (
                            <>
                              <Lock className="h-3 w-3 mr-1" />
                              {t('shop.notEnoughPoints')}
                            </>
                          ) : (
                            t('shop.buy')
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="emojis" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nálepky robota Kamoše jsou jen v Kamosféře. Tři máš zdarma, další si odemkni body. Vložíš je ✨ tlačítkem
              při psaní příspěvku.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {premiumEmojis.map((emoji) => {
                const owned = isOwned(emoji.id);
                const effectiveCost = getEffectiveCost(emoji.cost);
                const canAfford = userData.total_points >= effectiveCost;
                
                return (
                  <div
                    key={emoji.id}
                    className={cn(
                      "relative rounded-xl border-2 p-4 transition-all text-center",
                      owned ? "border-green-500/50 bg-green-500/5" : "border-border",
                      !owned && canAfford && "hover:border-amber-500/50"
                    )}
                  >
                    <div className="h-20 w-20 mx-auto mb-3 rounded-2xl bg-white flex items-center justify-center shadow-sm ring-1 ring-black/5">
                      <StickerImage url={emoji.url} name={emoji.name} className="h-[4.5rem] w-[4.5rem]" />
                    </div>
                    
                    <h4 className="font-medium text-sm mb-1 truncate">{emoji.name}</h4>
                    <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-3">
                      <Star className="h-3 w-3 text-amber-500" />
                      {isVIP && emoji.cost > 0 ? (
                        <>
                          <span className="line-through opacity-60">{emoji.cost}</span>
                          <span className="text-amber-500 font-semibold">{effectiveCost}</span>
                        </>
                      ) : (
                        <span>{effectiveCost}</span>
                      )}
                    </div>
                    
                    {owned ? (
                      <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        {t('shop.owned')}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        disabled={!canAfford || purchasing === emoji.id}
                        onClick={() => purchaseItem(emoji.id, effectiveCost, 'emoji')}
                        variant={canAfford ? "default" : "secondary"}
                      >
                        {purchasing === emoji.id ? (
                          <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : !canAfford ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          t('shop.buy')
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Info */}
        <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            <Crown className="h-4 w-4 text-amber-500" />
            {t('shop.howToEarn')}
          </h4>
          <p className="text-sm text-muted-foreground">
            {t('shop.howToEarnText')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
