import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { Feed } from '@/components/social/Feed';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { AuthModal } from '@/components/auth/AuthModal';
import { FloatingGameMenu } from '@/components/games/FloatingGameMenu';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import logo from '@/assets/logo.jpg';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Index = () => {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setCurrentProfile(data);
      } else {
        setCurrentProfile(null);
      }
    };

    fetchProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Landing page for non-authenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
          <div className="relative container mx-auto px-4 py-20 lg:py-32">
            <div className="max-w-3xl mx-auto text-center">
              <img src={logo} alt="Kamosféra" className="w-40 h-40 mx-auto mb-6 rounded-3xl shadow-2xl" />
              <h1 className="text-5xl lg:text-7xl font-bold mb-4">
                <span className="gradient-text">Kamosféra</span>
              </h1>
              <p className="text-lg text-primary/80 mb-2">Dětská sociální síť</p>
              <p className="text-xl lg:text-2xl text-muted-foreground mb-8">
                Místo pro kamarády ze školy — příspěvky, zprávy, hry a robot,
                který dává pozor, aby tu bylo bezpečno.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={() => setShowAuthModal(true)}
                  className="text-lg px-8"
                >
                  Začít zdarma
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setShowAuthModal(true)}
                  className="text-lg px-8"
                >
                  Přihlásit se
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="container mx-auto px-4 py-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card rounded-2xl p-8 border border-border text-center animate-fadeIn">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💬</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Sdílej své myšlenky</h3>
              <p className="text-muted-foreground">
                Publikuj příspěvky, fotky a videa. Sdílej, co máš na srdci.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-8 border border-border text-center animate-fadeIn" style={{ animationDelay: '0.1s' }}>
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">👥</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Najdi přátele</h3>
              <p className="text-muted-foreground">
                Tvoji kamarádi ze školy, nikdo cizí. Kdo ti chce psát a není kamarád, musí nejdřív počkat, jestli chceš ty.
              </p>
            </div>
            <div className="bg-card rounded-2xl p-8 border border-border text-center animate-fadeIn" style={{ animationDelay: '0.2s' }}>
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🚀</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Objevuj nové</h3>
              <p className="text-muted-foreground">
                Sleduj trendy, objevuj zajímavý obsah a inspiruj se.
              </p>
            </div>
          </div>
        </div>

        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    );
  }

  // Main app for authenticated users
  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <MobileHeader currentProfile={currentProfile} />
      
      {/* Desktop Sidebar */}
      <Sidebar currentProfile={currentProfile} />
      
      {/* Main Content */}
      <main className="pt-[calc(env(safe-area-inset-top)+3.75rem)] pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <Feed currentProfile={currentProfile} />
        </div>
      </main>

      {/* Desktop Right Sidebar */}
      <RightSidebar />
      
      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Floating Game Menu */}
      <FloatingGameMenu />
    </div>
  );
};

export default Index;
