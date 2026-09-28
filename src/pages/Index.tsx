import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { Feed } from '@/components/social/Feed';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { AuthModal } from '@/components/auth/AuthModal';
import { Landing } from '@/components/landing/Landing';
import { FloatingGameMenu } from '@/components/games/FloatingGameMenu';
import { Loader2 } from 'lucide-react';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Index = () => {
  const { user, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
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

  // Úvodní stránka pro nepřihlášené
  if (!user) {
    return (
      <>
        <Landing
          onJoin={() => { setAuthTab('signup'); setShowAuthModal(true); }}
          onLogin={() => { setAuthTab('login'); setShowAuthModal(true); }}
        />
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} defaultTab={authTab} />
      </>
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
