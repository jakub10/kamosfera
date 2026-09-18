import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PostCard } from './PostCard';
import { CreatePost } from './CreatePost';
import { Stories } from './Stories';
import { Loader2 } from 'lucide-react';
import { PostBackgroundStyle } from './VIPPostFeatures';
import mascotWave from '@/assets/mascot-wave.png';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  background_style: PostBackgroundStyle;
}

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface PostWithDetails extends Post {
  profile?: Profile;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  is_vip_user?: boolean;
}

interface FeedProps {
  currentProfile?: Profile | null;
}

export function Feed({ currentProfile }: FeedProps) {
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPosts = async () => {
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(postsData.map((p) => p.user_id))];

      // Fetch profiles for all users
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = new Map(
        profilesData?.map((p) => [p.user_id, p]) || []
      );

      // Fetch likes counts
      const { data: likesData } = await supabase
        .from('likes')
        .select('post_id')
        .in('post_id', postsData.map((p) => p.id));

      const likesCountMap = new Map<string, number>();
      likesData?.forEach((like) => {
        likesCountMap.set(like.post_id, (likesCountMap.get(like.post_id) || 0) + 1);
      });

      // Check which posts current user has liked
      let userLikesSet = new Set<string>();
      if (user) {
        const { data: userLikes } = await supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', user.id);
        userLikesSet = new Set(userLikes?.map((l) => l.post_id) || []);
      }

      // Fetch comments counts
      const { data: commentsData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postsData.map((p) => p.id));

      const commentsCountMap = new Map<string, number>();
      commentsData?.forEach((comment) => {
        commentsCountMap.set(comment.post_id, (commentsCountMap.get(comment.post_id) || 0) + 1);
      });

      // Check which users are VIP
      const { data: vipRolesData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'vip')
        .in('user_id', userIds);

      const vipUsersSet = new Set(vipRolesData?.map(r => r.user_id) || []);

      // Combine all data
      const enrichedPosts: PostWithDetails[] = postsData.map((post) => ({
        ...post,
        background_style: post.background_style as PostBackgroundStyle,
        profile: profilesMap.get(post.user_id) as Profile | undefined,
        likes_count: likesCountMap.get(post.id) || 0,
        comments_count: commentsCountMap.get(post.id) || 0,
        is_liked: userLikesSet.has(post.id),
        is_vip_user: vipUsersSet.has(post.user_id),
      }));

      setPosts(enrichedPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('posts-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Stories />
      <CreatePost onPostCreated={fetchPosts} currentProfile={currentProfile} />
      
      {posts.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center flex flex-col items-center gap-4">
          <img
            src={mascotWave}
            alt="Robot mává"
            className="w-48 h-48 sm:w-64 sm:h-64 object-contain"
            loading="lazy"
          />
          <p className="text-muted-foreground">
            <span className="text-gradient-flow font-semibold">Zatím je tu ticho.</span> Napiš něco jako první — nebo se podívej, kdo tu je.
          </p>
          <Button variant="outline" asChild>
            <Link to="/search">Najít kamarády</Link>
          </Button>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard 
            key={post.id} 
            post={post} 
            onLikeChange={fetchPosts} 
            onPostDeleted={fetchPosts}
          />
        ))
      )}
    </div>
  );
}
