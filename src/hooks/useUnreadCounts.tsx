import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useUnreadCounts() {
  const { user } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      setUnreadMessages(0);
      return;
    }

    const fetchCounts = async () => {
      const [notifResult, convsResult] = await Promise.all([
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false),
        supabase
          .from('conversations')
          .select('id')
          .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`),
      ]);

      setUnreadNotifications(notifResult.count ?? 0);

      const convIds = convsResult.data?.map((c) => c.id) ?? [];
      if (convIds.length === 0) {
        setUnreadMessages(0);
        return;
      }

      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('read', false)
        .neq('sender_id', user.id)
        .in('conversation_id', convIds);

      setUnreadMessages(count ?? 0);
    };

    fetchCounts();

    const channel = supabase
      .channel(`unread-counts-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchCounts)
      .subscribe();
    // Zprávy hlásí přečtení hned, nečeká se na Realtime.
    window.addEventListener('kamosfera:unread-changed', fetchCounts);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('kamosfera:unread-changed', fetchCounts);
    };
  }, [user]);

  return { unreadNotifications, unreadMessages };
}
