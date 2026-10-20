import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/social/Sidebar';
import { RightSidebar } from '@/components/social/RightSidebar';
import { MobileNav } from '@/components/social/MobileNav';
import { MobileHeader } from '@/components/social/MobileHeader';
import { PostCard } from '@/components/social/PostCard';
import mascotLost from '@/assets/mascot-lost.png';

interface Profile {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

type Post = Parameters<typeof PostCard>[0]['post'];

/**
 * Jeden příspěvek na vlastní adrese /post/:id — pro „Zkopírovat odkaz"
 * a pro Panel tvůrce („Zobrazit příspěvek podle ID"). Dřív tahle stránka
 * neexistovala a oba odkazy končily na 404.
 */
const PostDetail = () => {
  const { postId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [post, setPost] = useState<Post | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!user) return;
    const id = postId.trim();
    const [{ data: me }, { data: p }] = await Promise.all([
      supabase.from('profiles').select('username, full_name, avatar_url').eq('user_id', user.id).maybeSingle(),
      // Neplatné ID (ne UUID) by databáze odmítla chybou — rovnou „nenalezeno".
      /^[0-9a-f-]{36}$/i.test(id)
        ? supabase.from('posts').select('*').eq('id', id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setCurrentProfile(me);
    if (!p) {
      setPost(null);
      return;
    }
    const [{ data: author }, { count: likes }, { count: comments }, { data: myLike }] = await Promise.all([
      supabase.from('profiles').select('username, full_name, avatar_url').eq('user_id', p.user_id).maybeSingle(),
      supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', p.id),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', p.id),
      supabase.from('likes').select('id').eq('post_id', p.id).eq('user_id', user.id).maybeSingle(),
    ]);
    setPost({
      ...p,
      profile: author ?? undefined,
      likes_count: likes ?? 0,
      comments_count: comments ?? 0,
      is_liked: !!myLike,
    } as Post);
  }, [postId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader currentProfile={currentProfile} />
      <Sidebar currentProfile={currentProfile} />

      <main className="pt-16 pb-20 md:pt-6 md:pb-6 md:ml-64 lg:mr-80 px-4 md:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Zpět
          </button>

          {!user ? (
            <p className="rounded-xl border p-6 text-center">
              Příspěvek uvidíš po přihlášení.{' '}
              <Link to="/" className="font-semibold text-primary underline">
                Přihlásit se
              </Link>
            </p>
          ) : post === undefined ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : post === null ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
              <img src={mascotLost} alt="" className="h-32 w-32 object-contain" loading="lazy" />
              <p className="font-semibold">Tenhle příspěvek tu není.</p>
              <p className="text-sm text-muted-foreground">Možná byl smazaný, nebo ho píše někdo, s kým nejste kamarádi.</p>
            </div>
          ) : (
            <PostCard post={post} onLikeChange={() => void load()} onPostDeleted={() => navigate('/')} />
          )}
        </div>
      </main>

      <RightSidebar />
      <MobileNav />
    </div>
  );
};

export default PostDetail;
