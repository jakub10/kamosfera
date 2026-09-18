import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { PostCard } from '@/components/social/PostCard';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Search as SearchIcon, Users, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import mascotSearch from '@/assets/mascot-search.png';
import { MembersList } from '@/components/social/MembersList';

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio?: string | null;
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

const Search = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState('users');

  useEffect(() => {
    const fetchCurrentProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      setCurrentProfile(data);
    };
    fetchCurrentProfile();
  }, [user]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (query.trim()) {
        search();
      } else {
        setUsers([]);
        setPosts([]);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [query, activeTab]);

  const search = async () => {
    // Sanitize: cap length, escape ILIKE wildcards
    const q = query.trim().slice(0, 100).replace(/[%_]/g, '\\$&');
    if (!q) return;
    setLoading(true);

    if (activeTab === 'users') {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url, bio')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(20);
      setUsers(data || []);
    } else {
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .ilike('content', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (postsData && postsData.length > 0) {
        const userIds = [...new Set(postsData.map(p => p.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, full_name, avatar_url')
          .in('user_id', userIds);

        const profilesMap = new Map(
          profilesData?.map(p => [p.user_id, p]) || []
        );

        // Fetch likes counts
        const postIds = postsData.map(p => p.id);
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
          profile: profilesMap.get(post.user_id),
          likes_count: likesCountMap.get(post.id) || 0,
          comments_count: commentsCountMap.get(post.id) || 0,
          is_liked: userLikesSet.has(post.id),
        }));

        setPosts(enrichedPosts);
      } else {
        setPosts([]);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Hledat uživatele nebo příspěvky..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-12 h-12 text-lg"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="users" className="flex-1 gap-2">
                <Users className="h-4 w-4" />
                Uživatelé
              </TabsTrigger>
              <TabsTrigger value="posts" className="flex-1 gap-2">
                <FileText className="h-4 w-4" />
                Příspěvky
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !query.trim() ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Kdo je v Kamosféře — všichni, koho tu můžeš potkat.
                  </p>
                  <MembersList />
                </div>
              ) : users.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center flex flex-col items-center gap-4">
                  <img src={mascotSearch} alt="" className="w-36 h-36 sm:w-44 sm:h-44 object-contain" loading="lazy" />
                  <p className="text-muted-foreground">Nikoho takového jsme nenašli. Zkus přezdívku.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map(profile => (
                    <div
                      key={profile.user_id}
                      className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/profile/${profile.user_id}`)}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile.avatar_url || ''} />
                        <AvatarFallback>{profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold">{profile.full_name}</p>
                        <p className="text-sm text-muted-foreground">@{profile.username}</p>
                        {profile.bio && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{profile.bio}</p>
                        )}
                      </div>
                      <Button size="sm">Zobrazit</Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="posts" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : posts.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center flex flex-col items-center gap-4">
                  <img src={mascotSearch} alt="" className="w-36 h-36 sm:w-44 sm:h-44 object-contain" loading="lazy" />
                  <p className="text-muted-foreground">
                    {query ? 'Žádné příspěvky nenalezeny' : 'Zadej hledaný výraz'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default Search;
