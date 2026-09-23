import { FortressCard } from '@/components/fortress/FortressCard';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { PostCard } from '@/components/social/PostCard';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2, MapPin, Link as LinkIcon, Calendar, MessageCircle, UserPlus, UserCheck, UserX, Check, X as XIcon, Ban, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MessageRequestDialog } from '@/components/social/MessageRequestDialog';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import mascotLost from '@/assets/mascot-lost.png';
import mascotWelcome from '@/assets/mascot-welcome.png';
import mascotCamera from '@/assets/mascot-camera.png';

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
}

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  profile?: {
    username: string;
    full_name: string;
    avatar_url: string | null;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

const UserProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const [requestOpen, setRequestOpen] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [postsCount, setPostsCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);

  useEffect(() => {
    if (userId) {
      fetchProfile();
      fetchCurrentProfile();
      checkFriendship();
    }
  }, [userId, user]);

  const fetchCurrentProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, bio, location, website, created_at')
      .eq('user_id', user.id)
      .maybeSingle();
    setCurrentProfile(data);
  };

  const checkFriendship = async () => {
    if (!user || !userId || user.id === userId) return;
    
    const { data } = await supabase
      .from('friendships')
      .select('id, status, requester_id, addressee_id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
      .maybeSingle();
    
    if (data) {
      setFriendshipId(data.id);
      if (data.status === 'accepted') {
        setFriendshipStatus('accepted');
      } else if (data.status === 'pending') {
        // Check if current user sent the request or received it
        if (data.requester_id === user.id) {
          setFriendshipStatus('pending_sent');
        } else {
          setFriendshipStatus('pending_received');
        }
      }
    } else {
      setFriendshipStatus('none');
      setFriendshipId(null);
    }
  };

  const fetchProfile = async () => {
    if (!userId) return;

    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url, bio, location, website, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !profileData) {
      setLoading(false);
      return;
    }

    setProfile(profileData);

    // Fetch user's posts
    const { data: postsData, count } = await supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    setPostsCount(count || 0);

    // Fetch friends count
    const { count: friendsTotal } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    setFriendsCount(friendsTotal || 0);

    if (postsData && postsData.length > 0) {
      const postIds = postsData.map(p => p.id);

      // Fetch likes counts
      const { data: likesData } = await supabase
        .from('likes')
        .select('post_id')
        .in('post_id', postIds);

      const likesCountMap = new Map<string, number>();
      likesData?.forEach(like => {
        likesCountMap.set(like.post_id, (likesCountMap.get(like.post_id) || 0) + 1);
      });

      // Check user likes
      let userLikesSet = new Set<string>();
      if (user) {
        const { data: userLikes } = await supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', user.id);
        userLikesSet = new Set(userLikes?.map(l => l.post_id) || []);
      }

      // Fetch comments counts
      const { data: commentsData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);

      const commentsCountMap = new Map<string, number>();
      commentsData?.forEach(comment => {
        commentsCountMap.set(comment.post_id, (commentsCountMap.get(comment.post_id) || 0) + 1);
      });

      const enrichedPosts: Post[] = postsData.map(post => ({
        ...post,
        profile: {
          username: profileData.username,
          full_name: profileData.full_name,
          avatar_url: profileData.avatar_url,
        },
        likes_count: likesCountMap.get(post.id) || 0,
        comments_count: commentsCountMap.get(post.id) || 0,
        is_liked: userLikesSet.has(post.id),
      }));

      setPosts(enrichedPosts);
    }

    setLoading(false);
  };

  // Kamarádovi se píše rovnou. Komu ještě nejsi kamarád, ten nejdřív pošle
  // jednu krátkou zprávu a čeká, jestli ji druhá strana přijme.
  const handleMessageClick = () => {
    if (friendshipStatus === 'accepted') {
      void openConversation();
    } else {
      setRequestOpen(true);
    }
  };

  const openConversation = async (intro?: string) => {
    if (!user || !profile) return;
    setSendingRequest(true);

    const { error } = await supabase.rpc('start_conversation', {
      _target_user_id: profile.user_id,
      _intro: intro,
    });

    setSendingRequest(false);

    if (error) {
      toast({
        title: 'Zprávu se nepodařilo odeslat',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setRequestOpen(false);

    if (intro) {
      toast({
        title: 'Žádost odeslána',
        description: `${profile.full_name} se rozhodne, jestli si chcete psát.`,
      });
    } else {
      navigate('/messages');
    }
  };

  const blockUser = async () => {
    if (!profile) return;

    const { error } = await supabase.rpc('block_user', { _user_id: profile.user_id });

    if (error) {
      toast({
        title: 'Blokování se nezdařilo',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Uživatel zablokován',
      description: `${profile.full_name} ti už nemůže psát a neuvidíš jeho příspěvky.`,
    });
    navigate('/');
  };

  const sendFriendRequest = async () => {
    if (!user || !profile) return;

    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: user.id,
        addressee_id: profile.user_id,
        status: 'pending',
      });

    if (!error) {
      setFriendshipStatus('pending_sent');
      toast({
        title: 'Žádost odeslána',
        description: `Žádost o přátelství byla odeslána uživateli ${profile.full_name}.`,
      });
    }
  };

  const acceptFriendRequest = async () => {
    if (!friendshipId) return;

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (!error) {
      setFriendshipStatus('accepted');
      toast({
        title: 'Přátelství přijato',
        description: `Nyní jste přátelé s ${profile?.full_name}.`,
      });
    }
  };

  const declineFriendRequest = async () => {
    if (!friendshipId) return;

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (!error) {
      setFriendshipStatus('none');
      setFriendshipId(null);
      toast({
        title: 'Žádost odmítnuta',
        description: 'Žádost o přátelství byla odmítnuta.',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader currentProfile={currentProfile} />
        <Sidebar currentProfile={currentProfile} />
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

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader currentProfile={currentProfile} />
        <Sidebar currentProfile={currentProfile} />
        <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
          <div className="max-w-2xl mx-auto text-center py-12 flex flex-col items-center gap-4">
            <img src={mascotLost} alt="Robot stránku nenašel" className="w-40 h-40 object-contain" loading="lazy" />
            <p className="text-muted-foreground">Uživatel nenalezen</p>
          </div>
        </main>
        <RightSidebar />
        <MobileNav />
      </div>
    );
  }

  const isOwnProfile = user?.id === profile.user_id;

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile Card */}
          <Card className="overflow-hidden">
            {/* Cover Image */}
            <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20" />
            
            <CardHeader className="relative pt-0">
              {/* Avatar */}
              <div className="pointer-events-none absolute -top-16 left-6 z-0">
                <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="text-4xl bg-primary/10">
                    {profile.full_name?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Action buttons */}
              <div className="relative z-10 flex min-h-[4.5rem] flex-wrap justify-end gap-2 pt-3 pl-36 sm:min-h-0 sm:pl-0">
                {!isOwnProfile && user && (
                  <>
                    {friendshipStatus === 'none' && (
                      <Button variant="outline" size="sm" onClick={sendFriendRequest} className="shrink-0">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Přidat přítele
                      </Button>
                    )}
                    {friendshipStatus === 'pending_sent' && (
                      <Button variant="outline" size="sm" disabled className="shrink-0">
                        <UserCheck className="h-4 w-4 mr-2" />
                        Žádost odeslána
                      </Button>
                    )}
                    {friendshipStatus === 'pending_received' && (
                      <>
                        <Button variant="default" size="sm" onClick={acceptFriendRequest} className="shrink-0">
                          <Check className="h-4 w-4 mr-2" />
                          Přijmout
                        </Button>
                        <Button variant="outline" size="sm" onClick={declineFriendRequest} className="shrink-0">
                          <XIcon className="h-4 w-4 mr-2" />
                          Odmítnout
                        </Button>
                      </>
                    )}
                    {friendshipStatus === 'accepted' && (
                      <Button variant="outline" size="sm" disabled className="shrink-0">
                        <UserCheck className="h-4 w-4 mr-2" />
                        Přátelé
                      </Button>
                    )}
                    <Button size="sm" onClick={handleMessageClick} className="shrink-0">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Zpráva
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="shrink-0" aria-label="Další možnosti">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setBlockConfirmOpen(true)}
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Zablokovat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                {isOwnProfile && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/profile')} className="shrink-0">
                    Upravit profil
                  </Button>
                )}
              </div>

              {/* Name and username */}
              <div className="mt-12">
                <h1 className="text-2xl font-bold">{profile.full_name}</h1>
                <p className="text-muted-foreground">@{profile.username}</p>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {profile.bio && (
                <p className="text-foreground leading-relaxed">{profile.bio}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {profile.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    <span>{profile.location}</span>
                  </div>
                )}
                {profile.website && (() => {
                  try {
                    const url = new URL(profile.website.startsWith('http') ? profile.website : `https://${profile.website}`);
                    if (!['http:', 'https:'].includes(url.protocol)) return null;
                    return (
                      <a
                        href={url.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <LinkIcon className="h-4 w-4" />
                        <span>{url.hostname}</span>
                      </a>
                    );
                  } catch { return null; }
                })()}
                {profile.created_at && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>Členem od {format(new Date(profile.created_at), 'MMMM yyyy', { locale: cs })}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="text-center px-4">
                  <p className="text-2xl font-bold text-foreground">{postsCount}</p>
                  <p className="text-sm text-muted-foreground">Příspěvků</p>
                </div>
                <div className="text-center px-4">
                  <p className="text-2xl font-bold text-foreground">{friendsCount}</p>
                  <p className="text-sm text-muted-foreground">Přátel</p>
                </div>
                <div className="text-center px-4">
                  <p className="text-2xl font-bold text-foreground">0</p>
                  <p className="text-sm text-muted-foreground">Sledujících</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <FortressCard ownerId={profile.user_id} isOwn={isOwnProfile} />

          {/* Posts */}
          <h2 className="text-xl font-semibold">Příspěvky</h2>
          
          {posts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center flex flex-col items-center gap-4">
                <img src={isOwnProfile ? mascotCamera : mascotWelcome} alt="" className="w-36 h-36 object-contain" loading="lazy" />
                <p className="text-muted-foreground">
                  {isOwnProfile 
                    ? 'Zatím nemáte žádné příspěvky.' 
                    : 'Tento uživatel zatím nemá žádné příspěvky.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <PostCard key={post.id} post={post} onLikeChange={fetchProfile} />
              ))}
            </div>
          )}
        </div>
      </main>

      <RightSidebar />
      <MobileNav />

      {profile && (
        <MessageRequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          recipientName={profile.full_name}
          sending={sendingRequest}
          onSend={(intro) => void openConversation(intro)}
        />
      )}

      <AlertDialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zablokovat {profile?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nebude ti moct psát ani tě nikde najít a zmizí ti jeho příspěvky
              a komentáře. Pokud jste kamarádi, kamarádství se zruší.
              Zablokování můžeš kdykoli vrátit v nastavení.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zpět</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void blockUser()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Zablokovat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserProfile;
