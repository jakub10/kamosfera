import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Bell, Heart, MessageCircle, UserPlus, Check } from 'lucide-react';
import mascotSleep from '@/assets/mascot-sleep.png';
import { getReaction } from '@/lib/reactions';
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Notification {
  id: string;
  user_id: string;
  type: string;
  from_user_id: string | null;
  post_id: string | null;
  message: string | null;
  read: boolean;
  created_at: string;
  from_profile?: Profile;
}

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchNotifications();
    fetchCurrentProfile();

    // Subscribe to new notifications
    if (user) {
      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchCurrentProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    setCurrentProfile(data);
  };

  const fetchNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Fetch profiles for from_user_id
    const fromUserIds = data
      .filter(n => n.from_user_id)
      .map(n => n.from_user_id as string);

    if (fromUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', fromUserIds);

      const profilesMap = new Map(
        profilesData?.map(p => [p.user_id, p]) || []
      );

      const enrichedNotifications = data.map(n => ({
        ...n,
        from_profile: n.from_user_id ? profilesMap.get(n.from_user_id) : undefined,
      }));

      setNotifications(enrichedNotifications);
    } else {
      setNotifications(data);
    }

    setLoading(false);
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id);

    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-5 w-5 text-red-500" />;
      case 'comment':
        return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'follow':
      case 'friend_request':
      case 'friend_accepted':
        return <UserPlus className="h-5 w-5 text-green-500" />;
      case 'message':
      case 'message_request':
      case 'message_accepted':
        return <MessageCircle className="h-5 w-5 text-primary" />;
      default:
        return <Bell className="h-5 w-5 text-primary" />;
    }
  };

  const getMessage = (notification: Notification) => {
    const name = notification.from_profile?.full_name || 'Někdo';
    switch (notification.type) {
      case 'like': {
        const r = getReaction(notification.message);
        return r
          ? `${name} ${r.sentenceOne} u tvého příspěvku`
          : `${name} reagoval/a na tvůj příspěvek`;
      }
      case 'friend_request':
        return `${name} chce být tvůj kamarád`;
      case 'friend_accepted':
        return `${name} přijal/a tvoje kamarádství`;
      case 'comment':
        return `${name} okomentoval/a tvůj příspěvek`;
      case 'follow':
        return `${name} tě začal/a sledovat`;
      case 'message':
        return `${name} ti poslal/a zprávu`;
      case 'message_request':
        return `${name} ti chce psát — podívej se, jestli si chcete povídat`;
      case 'message_accepted':
        return `${name} přijal/a tvou zprávu, můžete si psát`;
      default:
        return notification.message || 'Nové oznámení';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Bell className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Oznámení</h1>
              {unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-sm px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" onClick={markAllAsRead}>
                <Check className="h-4 w-4 mr-2" />
                Označit vše jako přečtené
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center flex flex-col items-center gap-4">
              <img src={mascotSleep} alt="" className="w-40 h-40 sm:w-48 sm:h-48 object-contain" loading="lazy" />
              <p className="text-muted-foreground">
                Zatím nemáš žádná oznámení. Až se něco stane, dáme ti vědět!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                    notification.read
                      ? 'bg-card border-border'
                      : 'bg-primary/5 border-primary/20'
                  }`}
                  onClick={() => {
                    if (!notification.read) markAsRead(notification.id);
                    if (['message', 'message_request', 'message_accepted'].includes(notification.type)) {
                      navigate('/messages');
                    } else if (['friend_request', 'friend_accepted', 'follow'].includes(notification.type) && notification.from_user_id) {
                      navigate(`/profile/${notification.from_user_id}`);
                    } else if (['like', 'comment', 'mention'].includes(notification.type)) {
                      // Příspěvek je můj — najdu ho na svém profilu.
                      navigate('/profile');
                    }
                  }}
                >
                  <div className="flex-shrink-0">
                    {notification.from_profile ? (
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={notification.from_profile.avatar_url || ''} />
                        <AvatarFallback>{notification.from_profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        {getIcon(notification.type)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getIcon(notification.type)}
                      <p className="font-medium">{getMessage(notification)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: cs })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="h-3 w-3 rounded-full bg-primary flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Notifications;
