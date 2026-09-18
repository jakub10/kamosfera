import { useState, useRef, useEffect, useCallback } from 'react';
import { Confetti } from '@/components/ui/Confetti';
import { Image, Smile, MapPin, Send, X, Loader2, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { 
  VIPBackgroundPicker, 
  VIPEmojiPicker, 
  PostBackgroundStyle, 
  getBackgroundClass,
  VIPBadge 
} from './VIPPostFeatures';
import { cn } from '@/lib/utils';

interface CreatePostProps {
  onPostCreated?: () => void;
  currentProfile?: {
    avatar_url: string | null;
    full_name: string;
  } | null;
}

// Střídavé nápovědy — ať to nezní jako Facebook, a ať je každý den jiná.
const PROMPTS = [
  'Co se dnes stalo?',
  'Ukaž kamarádům něco, co tě baví…',
  'Co ti dnes udělalo radost?',
  'Kam jsi dneska byl?',
  'Na co se těšíš?',
];
const promptIndex = new Date().getDate() % PROMPTS.length;

export function CreatePost({ onPostCreated, currentProfile }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [backgroundStyle, setBackgroundStyle] = useState<PostBackgroundStyle>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [unlockedItems, setUnlockedItems] = useState<string[]>([]);
  const [userPoints, setUserPoints] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isVIP } = useUserRole();

  const refreshShopData = async () => {
    if (!user) return;
    const [{ data: items }, { data: stats }] = await Promise.all([
      supabase.from('user_unlocked_items').select('item_id').eq('user_id', user.id),
      supabase.from('user_stats').select('total_points').eq('user_id', user.id).maybeSingle(),
    ]);
    setUnlockedItems((items || []).map((r: { item_id: string }) => r.item_id));
    setUserPoints(stats?.total_points || 0);
  };

  useEffect(() => {
    if (!user) return;
    refreshShopData();

    // Realtime: refresh when user purchases items or earns points
    const channel = supabase
      .channel(`shop-sync-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'user_unlocked_items',
        filter: `user_id=eq.${user.id}`,
      }, () => refreshShopData())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'user_stats',
        filter: `user_id=eq.${user.id}`,
      }, () => refreshShopData())
      .subscribe();

    // Also refresh when window/tab regains focus (e.g. coming back from shop)
    const onFocus = () => refreshShopData();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Chyba',
        description: 'Vyber prosím obrázek.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Chyba',
        description: 'Obrázek je příliš velký. Maximum je 10MB.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedImage(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    setContent(prev => prev + emoji.native);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!selectedImage || !user) return null;

    setUploadingImage(true);
    try {
      const fileExt = selectedImage.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, selectedImage);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('posts')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if ((!content.trim() && !selectedImage) || !user) return;

    setIsSubmitting(true);
    try {
      let imageUrl: string | null = null;
      
      if (selectedImage) {
        imageUrl = await uploadImage();
        if (!imageUrl && selectedImage) {
          throw new Error('Failed to upload image');
        }
      }

      const { error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: content.trim(),
          image_url: imageUrl,
          background_style: backgroundStyle,
        });

      if (error) throw error;

      setContent('');
      setBackgroundStyle(null);
      removeImage();
      setShowConfetti(true);
      toast({
        title: '🎉 Úspěch!',
        description: 'Příspěvek byl publikován.',
      });
      onPostCreated?.();
    } catch (error) {
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se publikovat příspěvek.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview background style
  const previewBgClass = backgroundStyle ? getBackgroundClass(backgroundStyle) : 'bg-card';

  return (
    <>
    <div className={cn("rounded-xl border border-border p-4 mb-4 animate-fadeIn", previewBgClass)}>
      <div className="flex gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={currentProfile?.avatar_url || ''} />
          <AvatarFallback>{currentProfile?.full_name?.[0] || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <Textarea
            placeholder={PROMPTS[promptIndex]}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0 text-base placeholder:text-muted-foreground"
          />
          
          {/* Image preview */}
          {imagePreview && (
            <div className="relative mt-3 rounded-xl overflow-hidden border border-border">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full max-h-80 object-cover"
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 rounded-full"
                onClick={removeImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border mt-3 flex-wrap">
            <div className="flex gap-0 sm:gap-1 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image className="h-5 w-5" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-0" align="start">
                  <Picker
                    data={data}
                    onEmojiSelect={handleEmojiSelect}
                    theme="auto"
                    locale="cs"
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </PopoverContent>
              </Popover>
              
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary">
                <MapPin className="h-5 w-5" />
              </Button>
              
              {/* Pozadí + speciální emoji - dostupné všem */}
              <VIPBackgroundPicker 
                selectedBackground={backgroundStyle} 
                onSelect={setBackgroundStyle}
                userPoints={userPoints}
                unlockedBackgrounds={unlockedItems}
              />
              <VIPEmojiPicker 
                onEmojiSelect={(emoji) => setContent(prev => prev + emoji)}
                userPoints={userPoints}
                unlockedEmojis={unlockedItems}
              />
            </div>
            {content.length > 0 && (
              <span className={cn(
                "text-xs tabular-nums",
                content.length > 450 ? "text-destructive font-semibold" :
                content.length > 400 ? "text-yellow-500" :
                "text-muted-foreground"
              )}>
                {content.length}/500
              </span>
            )}
            <Button
              onClick={handleSubmit}
              disabled={(!content.trim() && !selectedImage) || isSubmitting || content.length > 500}
              size="sm"
              className="gap-2 shrink-0"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Publikovat</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
    <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />
    </>
  );
}
