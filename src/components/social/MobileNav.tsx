import { Home, Search, MessageCircle, User, Users, Gamepad2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function MobileNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { unreadNotifications, unreadMessages } = useUnreadCounts();

  const navItems = [
    { icon: Home, label: t('nav.home'), path: '/', badge: 0 },
    { icon: Search, label: t('nav.search'), path: '/search', badge: 0 },
    { icon: Gamepad2, label: 'Hry', path: '/games', badge: 0 },
    { icon: MessageCircle, label: t('nav.messages'), path: '/messages', badge: unreadMessages },
    { icon: User, label: t('nav.profile'), path: '/profile', badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border md:hidden safe-area-bottom">
      <div className="flex justify-around items-center h-16 pb-safe">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                <UnreadBadge count={item.badge} />
              </div>
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
