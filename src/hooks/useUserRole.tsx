import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type AppRole = 'user' | 'vip' | 'creator' | 'vip_pro_max';

export function useUserRole() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRoles();
    } else {
      setRoles([]);
      setLoading(false);
    }
  }, [user]);

  const fetchRoles = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (!error && data) {
      setRoles(data.map(r => r.role as AppRole));
    }
    setLoading(false);
  };

  const titleFor = (role: AppRole) =>
    role === 'vip' ? 'VIP' : role === 'creator' ? 'Tvůrce' : 'VIP Pro Max';

  const activateRole = async (role: 'vip' | 'creator' | 'vip_pro_max', code: string): Promise<boolean> => {
    if (!user) return false;

    if (roles.includes(role)) {
      toast({
        title: `Již máte ${titleFor(role)}`,
        description: `Váš účet už má status ${titleFor(role)}.`,
      });
      return true;
    }

    // Jednorázový kód z Panelu tvůrce ověří databáze (dřív Edge funkce activate-role).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('activate_role_code', { _role: role, _code: code });

    if (error || !data?.success) {
      toast({
        title: 'Neplatný kód',
        description: `Kód pro aktivaci ${titleFor(role)} není správný.`,
        variant: 'destructive',
      });
      return false;
    }

    if (role === 'vip_pro_max') {
      setRoles(prev => Array.from(new Set([...prev, 'vip', 'vip_pro_max'])) as AppRole[]);
    } else {
      setRoles(prev => [...prev, role]);
    }
    toast({
      title:
        role === 'vip' ? '🌟 VIP Aktivováno!' :
        role === 'creator' ? '👑 Tvůrce Aktivován!' :
        '💎 VIP PRO MAX Aktivováno!',
      description:
        role === 'vip_pro_max'
          ? 'Získal jsi MEGA balíček: vše zdarma, exkluzivní odznak, neomezené možnosti!'
          : `Nyní máte přístup k funkcím ${titleFor(role)}.`,
    });
    return true;
  };

  const activateVIP = useCallback((code: string) => activateRole('vip', code), [user, roles, toast]);
  const activateCreator = useCallback((password: string) => activateRole('creator', password), [user, roles, toast]);
  const activateVipProMax = useCallback((code: string) => activateRole('vip_pro_max', code), [user, roles, toast]);

  const isVipProMax = roles.includes('vip_pro_max');
  const isVIP = roles.includes('vip') || isVipProMax;
  const isCreator = roles.includes('creator');

  return {
    roles,
    loading,
    isVIP,
    isCreator,
    isVipProMax,
    activateVIP,
    activateCreator,
    activateVipProMax,
    refetch: fetchRoles,
  };
}
