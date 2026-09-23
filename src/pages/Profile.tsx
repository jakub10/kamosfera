import { FortressCard } from '@/components/fortress/FortressCard';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, MapPin, Link as LinkIcon, Calendar, Camera, X, Edit3, Trophy, Crown, ShoppingCart, Sparkles, Gem } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Achievements } from '@/components/profile/Achievements';
import { VIPActivation } from '@/components/profile/VIPActivation';
import { VIPShop } from '@/components/profile/VIPShop';
import { CreatorPanel } from '@/components/profile/CreatorPanel';
import { useAchievements } from '@/hooks/useAchievements';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserRole } from '@/hooks/useUserRole';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
}

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Initialize achievements hook and get VIP status
  useAchievements();
  const { isVIP, isVipProMax } = useUserRole();

  // Edit form state
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url, bio, location, website, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setFullName(data.full_name || '');
        setBio(data.bio || '');
        setLocation(data.location || '');
        setWebsite(data.website || '');
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Chyba',
        description: 'Vyberte prosím obrázek.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Chyba',
        description: 'Obrázek je příliš velký. Maximum je 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploadingAvatar(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const newAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, avatar_url: newAvatarUrl } : null);
      
      toast({
        title: 'Úspěch',
        description: 'Profilový obrázek byl aktualizován.',
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se nahrát obrázek.',
        variant: 'destructive',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        bio,
        location,
        website,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se uložit změny.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Uloženo',
        description: 'Profil byl aktualizován.',
      });
      setProfile(prev => prev ? { ...prev, full_name: fullName, bio, location, website } : null);
      setIsEditing(false);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader currentProfile={profile} />
        <Sidebar currentProfile={profile} />
        <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
        <RightSidebar />
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={profile} />
      <Sidebar currentProfile={profile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Header Card */}
          <div className={isVipProMax ? 'promax-card-border' : ''}>
          <Card className="overflow-hidden">
            {/* Cover Image */}
            <div className={`h-32 ${isVipProMax ? 'promax-holo-cover' : 'bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20'}`} />
            
            <CardHeader className="relative pt-0">
              {/* Avatar with upload */}
              <div className="absolute -top-16 left-6">
                <div className={`relative group ${isVipProMax ? 'p-1 rounded-full bg-[conic-gradient(from_0deg,#ff00ea,#7c00ff,#00e0ff,#00ff85,#ffe600,#ff7a00,#ff00ea)] animate-spin-slow promax-glow' : ''}`}>
                  <Avatar className={`h-32 w-32 border-4 border-background shadow-lg`}>
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="text-4xl bg-primary/10">
                      {profile?.full_name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>

                  {isVipProMax && (
                    <>
                      <Sparkles className="promax-sparkle absolute -top-2 -right-2 h-6 w-6 text-fuchsia-400 pointer-events-none" />
                      <Sparkles className="promax-sparkle-2 absolute -bottom-1 -left-2 h-5 w-5 text-cyan-400 pointer-events-none" />
                      <Gem className="promax-sparkle absolute top-1/2 -right-4 h-4 w-4 text-purple-400 pointer-events-none" />
                    </>
                  )}
                  
                  {/* Upload overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    ) : (
                      <Camera className="h-8 w-8 text-white" />
                    )}
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Edit button */}
              <div className="flex justify-end pt-2">
                {!isEditing && (
                  <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Upravit profil
                  </Button>
                )}
              </div>

              {/* Name and username */}
              <div className="mt-12">
                <CardTitle className={`text-2xl flex items-center gap-2 flex-wrap ${isVipProMax ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent animate-gradient-x' : ''}`}>
                  {profile?.full_name}
                  {isVipProMax && (
                    <span className="promax-badge text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 text-white font-bold inline-flex items-center gap-1">
                      <Gem className="h-3 w-3" /> PRO MAX
                    </span>
                  )}
                </CardTitle>
                <p className="text-muted-foreground">@{profile?.username}</p>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {isEditing ? (
                <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Celé jméno</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Vaše celé jméno"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Napiš něco o sobě..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location">Lokace</Label>
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Praha, Česká republika"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Web</Label>
                      <Input
                        id="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Uložit změny
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      <X className="h-4 w-4 mr-2" />
                      Zrušit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {profile?.bio && (
                    <p className="text-foreground leading-relaxed">{profile.bio}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {profile?.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        <span>{profile.location}</span>
                      </div>
                    )}
                    {profile?.website && (() => {
                      try {
                        const url = new URL(profile.website.startsWith('http') ? profile.website : `https://${profile.website}`);
                        if (!['http:', 'https:'].includes(url.protocol)) return null;
                        return (
                          <a href={url.href} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-primary hover:underline">
                            <LinkIcon className="h-4 w-4" />
                            <span>{url.hostname}</span>
                          </a>
                        );
                      } catch { return null; }
                    })()}
                    {profile?.created_at && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        <span>Členem od {format(new Date(profile.created_at), 'MMMM yyyy', { locale: cs })}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </div>



          {user && <FortressCard ownerId={user.id} isOwn />}

          {/* Tabs for content */}
          {/* Příspěvky první: profil je místo, kde dítě vidí sebe, ne obchod. */}
          <Tabs defaultValue="posts" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="posts">Příspěvky</TabsTrigger>
              <TabsTrigger value="achievements" className="gap-2">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">Achievementy</span>
              </TabsTrigger>
              <TabsTrigger value="vip" className="gap-2">
                <Crown className="h-4 w-4" />
                VIP
              </TabsTrigger>
              <TabsTrigger value="shop" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">Obchod</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="achievements" className="mt-4">
              <Achievements />
            </TabsContent>

            <TabsContent value="vip" className="mt-4">
              <VIPActivation />
            </TabsContent>

            <TabsContent value="shop" className="mt-4">
              <VIPShop />
            </TabsContent>
            
            <TabsContent value="posts" className="mt-4">
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    Vaše příspěvky se zobrazí zde
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Creator Panel - hidden button at bottom right */}
          <CreatorPanel />
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Profile;
