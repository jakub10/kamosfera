import { useState, useEffect } from 'react';
import { MessageCircle, Share2, Bookmark, MoreHorizontal, Send, Trash2, Crown, Languages } from 'lucide-react';
import { ReactionPicker } from '@/components/social/ReactionPicker';
import { ReactionSummary, type Reactor } from '@/components/social/ReactionSummary';
import type { ReactionKind } from '@/lib/reactions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { formatDistanceToNow } from 'date-fns';
import { cs, enUS, sk } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { getBackgroundClass, PostBackgroundStyle, VIPBadge, renderVIPEmojis } from './VIPPostFeatures';
import { cn } from '@/lib/utils';

interface PostCardProps {
  post: {
    id: string;
    content: string;
    image_url: string | null;
    created_at: string;
    user_id: string;
    background_style?: PostBackgroundStyle;
    profile?: {
      username: string;
      full_name: string;
      avatar_url: string | null;
    };
    likes_count?: number;
    comments_count?: number;
    is_liked?: boolean;
    is_vip_user?: boolean;
  };
  onLikeChange?: () => void;
  onPostDeleted?: () => void;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: {
    username: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export function PostCard({ post, onLikeChange, onPostDeleted }: PostCardProps) {
  // These reaction APIs are deployed by a newer database migration than the
  // generated client schema currently exposes.
  const socialClient = supabase as any;
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [reacting, setReacting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isCreator } = useUserRole();
  const { t, i18n } = useTranslation();

  const isOwnPost = user?.id === post.user_id;
  const canDelete = isOwnPost || isCreator;
  const bgClass = getBackgroundClass(post.background_style || null);
  const dateLocale = i18n.language === 'en' ? enUS : i18n.language === 'sk' ? sk : cs;

  // Reakce se načítají zvlášť pro každý příspěvek: kdo reagoval a jak.
  // Počet nikde neukazujeme — v síti pár kamarádů je jméno cennější než číslo.
  useEffect(() => {
    let cancelled = false;
    socialClient.rpc('post_reactions', { _post_id: post.id }).then(({ data }: { data: Reactor[] | null }) => {
      if (cancelled || !data) return;
      setReactors(
        data.map((r) => ({
          kind: r.kind as ReactionKind,
          user_id: r.user_id,
          full_name: r.full_name,
          avatar_url: r.avatar_url,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  const myReaction = reactors.find((r) => r.user_id === user?.id)?.kind ?? null;

  const handleReact = async (kind: ReactionKind) => {
    if (!user) {
      toast({
        title: 'Přihlášení vyžadováno',
        description: 'Pro reakce se musíš přihlásit.',
        variant: 'destructive',
      });
      return;
    }

    const previous = reactors;
    const me: Reactor = {
      kind,
      user_id: user.id,
      full_name: 'Ty',
      avatar_url: null,
    };

    // Stejná reakce podruhé = vzít ji zpět. Jiná = vyměnit.
    const removing = myReaction === kind;
    setReactors(
      removing
        ? reactors.filter((r) => r.user_id !== user.id)
        : [...reactors.filter((r) => r.user_id !== user.id), me]
    );
    setReacting(true);

    const { error } = removing
      ? await socialClient.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await socialClient
          .from('likes')
          .upsert({ post_id: post.id, user_id: user.id, kind }, { onConflict: 'user_id,post_id' });

    setReacting(false);

    if (error) {
      setReactors(previous);
      toast({ title: 'Nepovedlo se', description: 'Zkus to prosím znovu.', variant: 'destructive' });
      return;
    }

    // Načíst znovu, ať má „Ty" správné jméno a avatar.
    const { data }: { data: Reactor[] | null } = await socialClient.rpc('post_reactions', { _post_id: post.id });
    if (data) {
      setReactors(
        data.map((r) => ({
          kind: r.kind as ReactionKind,
          user_id: r.user_id,
          full_name: r.full_name,
          avatar_url: r.avatar_url,
        }))
      );
    }
    onLikeChange?.();
  };

  const handleSave = async () => {
    if (!user) {
      toast({
        title: 'Přihlášení vyžadováno',
        description: 'Pro ukládání příspěvků se musíš přihlásit.',
        variant: 'destructive',
      });
      return;
    }

    if (isSaved) {
      setIsSaved(false);
      await supabase
        .from('saved_posts')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', user.id);
      toast({
        title: 'Odebráno',
        description: 'Příspěvek byl odebrán z uložených.',
      });
    } else {
      setIsSaved(true);
      await supabase
        .from('saved_posts')
        .insert({ post_id: post.id, user_id: user.id });
      toast({
        title: 'Uloženo',
        description: 'Příspěvek byl uložen do záložek.',
      });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + `/post/${post.id}`);
      toast({
        title: 'Odkaz zkopírován',
        description: 'Odkaz na příspěvek byl zkopírován do schránky.',
      });
    } catch {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se zkopírovat odkaz.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!user || !canDelete) return;

    setDeleting(true);
    try {
      // Delete post image from storage if exists
      if (post.image_url && post.image_url.includes('/posts/')) {
        const path = post.image_url.split('/posts/')[1];
        if (path && /^[\w\-./]+$/.test(path) && !path.includes('..')) {
          await supabase.storage.from('posts').remove([path]);
        }
      }

      // Build and execute delete query - RLS handles permissions
      let error;
      if (isCreator && !isOwnPost) {
        // Creator deleting someone else's post
        const result = await supabase
          .from('posts')
          .delete()
          .eq('id', post.id);
        error = result.error;
      } else {
        // User deleting their own post
        const result = await supabase
          .from('posts')
          .delete()
          .eq('id', post.id)
          .eq('user_id', user.id);
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: 'Smazáno',
        description: 'Příspěvek byl úspěšně smazán.',
      });
      onPostDeleted?.();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se smazat příspěvek.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    const { data: commentsData, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    if (error || !commentsData) {
      setComments([]);
      setLoadingComments(false);
      return;
    }

    // Fetch profiles for comments
    const userIds = [...new Set(commentsData.map(c => c.user_id))];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, full_name, avatar_url')
      .in('user_id', userIds);

    const profilesMap = new Map(
      profilesData?.map(p => [p.user_id, p]) || []
    );

    const enrichedComments = commentsData.map(comment => ({
      ...comment,
      profile: profilesMap.get(comment.user_id),
    }));

    setComments(enrichedComments);
    setLoadingComments(false);
  };

  const openComments = () => {
    setShowComments(true);
    fetchComments();
  };

  const submitComment = async () => {
    if (!newComment.trim() || !user) return;

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: post.id,
        user_id: user.id,
        content: newComment.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      // Fetch the profile for the new comment
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id, username, full_name, avatar_url')
        .eq('user_id', user.id)
        .single();

      setComments(prev => [...prev, { ...data, profile: profileData }]);
      setCommentsCount(prev => prev + 1);
      setNewComment('');
      toast({
        title: 'Komentář přidán',
        description: 'Tvůj komentář byl publikován.',
      });
    }
  };

  const timeAgo = formatDistanceToNow(new Date(post.created_at), {
    addSuffix: true,
    locale: dateLocale,
  });

  const handleTranslate = async () => {
    if (translatedContent !== null) {
      setTranslatedContent(null);
      return;
    }
    if (!post.content.trim()) return;
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: { text: post.content, targetLang: i18n.language },
      });
      if (error) throw error;
      setTranslatedContent(data?.translated || post.content);
    } catch (e) {
      toast({
        title: t('voice.error'),
        description: 'Translation failed',
        variant: 'destructive',
      });
    } finally {
      setTranslating(false);
    }
  };

  // Check if post is saved on mount
  useEffect(() => {
    const checkSaved = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsSaved(!!data);
    };
    checkSaved();
  }, [user, post.id]);

  // Dvojklik = rychlé „To je super", ale jen když ještě žádná reakce není.
  // Nesmí přepsat vědomě vybrané „Jsem s tebou".
  const handleDoubleClick = () => {
    if (!myReaction && user) {
      void handleReact('super');
    }
  };

  return (
    <>
      <article className={cn("rounded-xl border border-border p-4 post-card animate-fadeIn", bgClass)}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <Link to={`/profile/${post.user_id}`} className="flex items-center gap-3 hover:opacity-80">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profile?.avatar_url || ''} />
              <AvatarFallback>{post.profile?.full_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{post.profile?.full_name || 'Uživatel'}</p>
                {post.is_vip_user && <VIPBadge />}
              </div>
              <p className="text-sm text-muted-foreground">
                @{post.profile?.username || 'user'} · {timeAgo}
              </p>
            </div>
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                {t('post.copyLink')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSave}>
                <Bookmark className="h-4 w-4 mr-2" />
                {isSaved ? t('post.removeFromSaved') : t('post.savePost')}
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('post.deletePost')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <p className="text-foreground mb-2 whitespace-pre-wrap break-words">
          {renderVIPEmojis(translatedContent ?? post.content)}
        </p>
        {post.content.trim() && (
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="text-xs text-primary hover:underline mb-3 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Languages className="h-3 w-3" />
            {translating ? t('common.translating') : translatedContent ? t('common.showOriginal') : t('common.translate')}
          </button>
        )}

        {/* Image */}
        {post.image_url && (
          <div 
            className="rounded-xl overflow-hidden mb-3 cursor-pointer"
            onDoubleClick={handleDoubleClick}
          >
            <img
              src={post.image_url}
              alt="Post"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
              className="w-full h-auto object-cover max-h-[500px] bg-muted"
            />
          </div>
        )}

        {/* Kdo reagoval — jména a tváře, ne počet */}
        <ReactionSummary reactors={reactors} />

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex gap-1">
            <ReactionPicker current={myReaction} onPick={handleReact} disabled={reacting} />
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={openComments}>
              <MessageCircle className="h-5 w-5" />
              <span>{commentsCount}</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleShare}>
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={isSaved ? 'text-primary' : 'text-muted-foreground'}
            onClick={handleSave}
          >
            <Bookmark className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
          </Button>
        </div>
      </article>

      {/* Comments Dialog */}
      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('post.comments')}</DialogTitle>
            <DialogDescription>
              {commentsCount}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 max-h-[50vh]">
            <div className="space-y-4 py-4">
              {loadingComments ? (
                <p className="text-center text-muted-foreground">{t('common.loading')}</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-muted-foreground">{t('post.noComments')}</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <Link to={`/profile/${comment.user_id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.profile?.avatar_url || ''} />
                        <AvatarFallback>{comment.profile?.full_name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1">
                      <div className="bg-muted rounded-lg p-3">
                        <Link to={`/profile/${comment.user_id}`} className="font-medium hover:underline">
                          {comment.profile?.full_name || t('post.user')}
                        </Link>
                        <p className="text-sm mt-1 break-words">{renderVIPEmojis(comment.content)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {user && (
            <div className="pt-4 border-t border-border space-y-1">
              <div className="flex gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={post.profile?.avatar_url || ''} />
                  <AvatarFallback>{user.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <Input
                  placeholder={t('post.writeComment')}
                  value={newComment}
                  maxLength={2000}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && submitComment()}
                  className="flex-1"
                />
                <Button onClick={submitComment} disabled={!newComment.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {newComment.length > 1500 && (
                <p className="text-xs text-muted-foreground text-right pr-12">
                  {newComment.length} / 2000
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('post.deletePostConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('post.deletePostDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common.loading') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
