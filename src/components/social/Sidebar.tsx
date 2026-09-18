import { Home, Search, Bell, MessageCircle, Bookmark, User, Settings, LogOut, Users, Gamepad2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import logo from '@/assets/logo.jpg';

interface SidebarProps {
  currentProfile?: {
    username: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export function Sidebar({ currentProfile }: SidebarProps) {
  const { signOut } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const { unreadNotifications, unreadMessages } = useUnreadCounts();

  const navItems = [
    { icon: Home, label: t('nav.home'), path: '/', badge: 0 },
    { icon: Search, label: t('nav.search'), path: '/search', badge: 0 },
    { icon: Bell, label: t('nav.notifications'), path: '/notifications', badge: unreadNotifications },
    { icon: MessageCircle, label: t('nav.messages'), path: '/messages', badge: unreadMessages },
    { icon: Users, label: t('nav.groups'), path: '/groups', badge: 0 },
    { icon: Gamepad2, label: 'Hry', path: '/games', badge: 0 },
    { icon: Bookmark, label: t('nav.saved'), path: '/saved', badge: 0 },
    { icon: User, label: t('nav.profile'), path: '/profile', badge: 0 },
    { icon: Settings, label: t('nav.settings'), path: '/settings', badge: 0 },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex-col">
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Kamosféra" className="h-10 w-10 rounded-xl" />
          <h1 className="text-xl font-bold gradient-text">Kamosféra</h1>
        </Link>
        {/* Přepínač jazyka je schovaný: přeloží jen menu, zbytek je česky. Vrátí se, až bude obsah přeložený. */}
      </div>

      <nav className="flex-1 px-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={`w-full justify-start gap-4 mb-1 text-base font-medium hover:bg-accent ${
                  isActive ? 'bg-accent text-primary' : ''
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                {item.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      {currentProfile && (
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Link to="/profile">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentProfile.avatar_url || ''} />
                <AvatarFallback>{currentProfile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{currentProfile.full_name}</p>
              <p className="text-sm text-muted-foreground truncate">@{currentProfile.username}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title={t('nav.logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
