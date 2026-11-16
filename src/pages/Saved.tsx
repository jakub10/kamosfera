import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { PostCard } from '@/components/social/PostCard';
import { Loader2, Bookmark } from 'lucide-react';
import mascotSleep from '@/assets/mascot-sleep.webp';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

const Saved = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const fetchSavedPosts = async () => {
    if (!user) return;

    // Fetch current profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    setCurrentProfile(profileData);

    // Fetch saved posts
    const { data: savedData, error } = await supabase
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !savedData || savedData.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = savedData.map(s => s.post_id);

    // Fetch posts
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (!postsData || postsData.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    // Fetch profiles
    const userIds = [...new Set(postsData.map(p => p.user_id))];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .in('user_id', userIds);

    const profilesMap = new Map(
      profilesData?.map(p => [p.user_id, p]) || []
    );

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
    const { data: userLikes } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', user.id);

    const userLikesSet = new Set(userLikes?.map(l => l.post_id) || []);

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
      profile: profilesMap.get(post.user_id) as Profile | undefined,
      likes_count: likesCountMap.get(post.id) || 0,
      comments_count: commentsCountMap.get(post.id) || 0,
      is_liked: userLikesSet.has(post.id),
    }));

    setPosts(enrichedPosts);
    setLoading(false);
  };

  useEffect(() => {
    fetchSavedPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refetch = () => {
    if (!user) return;
    setLoading(true);
    fetchSavedPosts();
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />
      
      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Bookmark className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Uložené příspěvky</h1>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center flex flex-col items-center gap-4">
              <img src={mascotSleep} alt="" className="w-40 h-40 sm:w-48 sm:h-48 object-contain" loading="lazy" />
              <p className="text-muted-foreground">
                Zatím nemáš žádné uložené příspěvky. Ulož si je hvězdičkou!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <PostCard key={post.id} post={post} onLikeChange={refetch} />
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

export default Saved;
