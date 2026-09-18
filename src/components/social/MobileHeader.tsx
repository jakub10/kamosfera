import { Menu, LogOut, Settings, Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import logo from '@/assets/logo.jpg';

interface MobileHeaderProps {
  currentProfile?: {
    username: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export function MobileHeader({ currentProfile }: MobileHeaderProps) {
  const { signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border md:hidden pt-safe">
      <div className="flex items-center justify-between h-14 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Kamosféra" className="h-8 w-8 rounded-lg" />
          <h1 className="text-lg font-bold gradient-text">Kamosféra</h1>
        </Link>

        <div className="flex items-center gap-1">
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {currentProfile ? (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={currentProfile.avatar_url || ''} />
                  <AvatarFallback>{currentProfile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {currentProfile && (
              <>
                <div className="px-2 py-2">
                  <p className="font-medium">{currentProfile.full_name}</p>
                  <p className="text-sm text-muted-foreground">@{currentProfile.username}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link to="/saved" className="flex items-center gap-2">
                <Bookmark className="h-4 w-4" />
                {t('nav.saved')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('nav.settings')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              {t('nav.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
