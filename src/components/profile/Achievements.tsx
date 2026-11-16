import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Trophy, Star, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import mascotTrophy from '@/assets/mascot-trophy.webp';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  points: number;
}

interface UserAchievement {
  achievement_id: string;
  unlocked_at: string;
}

interface UserStats {
  posts_count: number;
  likes_received: number;
  likes_given: number;
  comments_count: number;
  friends_count: number;
  messages_sent: number;
  total_points: number;
}

const defaultStats: UserStats = {
  posts_count: 0,
  likes_received: 0,
  likes_given: 0,
  comments_count: 0,
  friends_count: 0,
  messages_sent: 0,
  total_points: 0,
};

export function Achievements({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  const targetUserId = userId || user?.id;

  useEffect(() => {
    const fetchData = async () => {
      if (!targetUserId) return;

      // Fetch all achievements
      const { data: achievementsData } = await supabase
        .from('achievements')
        .select('*')
        .order('category')
        .order('threshold');

      // Fetch user's unlocked achievements
      const { data: userAchievementsData } = await supabase
        .from('user_achievements')
        .select('achievement_id, unlocked_at')
        .eq('user_id', targetUserId);

      // Fetch user stats
      const { data: statsData } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (achievementsData) setAchievements(achievementsData);
      if (userAchievementsData) setUserAchievements(userAchievementsData);
      if (statsData) setStats(statsData);
      
      setLoading(false);
    };

    fetchData();
  }, [targetUserId]);

  const getProgressForCategory = (category: string): number => {
    switch (category) {
      case 'posts': return stats.posts_count;
      case 'likes': return stats.likes_given;
      case 'comments': return stats.comments_count;
      case 'friends': return stats.friends_count;
      case 'messages': return stats.messages_sent;
      default: return 0;
    }
  };

  const isUnlocked = (achievementId: string): boolean => {
    return userAchievements.some(ua => ua.achievement_id === achievementId);
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      posts: 'Příspěvky',
      likes: 'Lajky',
      comments: 'Komentáře',
      friends: 'Přátelé',
      messages: 'Zprávy',
    };
    return labels[category] || category;
  };

  const totalPoints = userAchievements.reduce((sum, ua) => {
    const achievement = achievements.find(a => a.id === ua.achievement_id);
    return sum + (achievement?.points || 0);
  }, 0);

  const unlockedCount = userAchievements.length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Group achievements by category
  const groupedAchievements = achievements.reduce((acc, achievement) => {
    if (!acc[achievement.category]) {
      acc[achievement.category] = [];
    }
    acc[achievement.category].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>);

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <Card className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <img src={mascotTrophy} alt="" className="hidden sm:block w-24 h-24 object-contain shrink-0" loading="lazy" />
            <div className="flex flex-1 items-center justify-around text-center">
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Trophy className="h-6 w-6 text-yellow-500" />
                  <span className="text-3xl font-bold">{unlockedCount}</span>
                </div>
                <p className="text-sm text-muted-foreground">Odemčeno</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Star className="h-6 w-6 text-primary" />
                  <span className="text-3xl font-bold">{totalPoints}</span>
                </div>
                <p className="text-sm text-muted-foreground">Bodů</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-3xl font-bold">{achievements.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Celkem achievementů</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Achievements by Category */}
      {Object.entries(groupedAchievements).map(([category, categoryAchievements]) => {
        const progress = getProgressForCategory(category);
        
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{getCategoryLabel(category)}</span>
                <Badge variant="secondary" className="font-normal">
                  {categoryAchievements.filter(a => isUnlocked(a.id)).length} / {categoryAchievements.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <TooltipProvider>
                  {categoryAchievements.map((achievement) => {
                    const unlocked = isUnlocked(achievement.id);
                    const progressPercent = Math.min((progress / achievement.threshold) * 100, 100);
                    
                    return (
                      <Tooltip key={achievement.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                              unlocked
                                ? 'bg-primary/10 border-primary'
                                : 'bg-muted/50 border-transparent opacity-60 hover:opacity-80'
                            }`}
                          >
                            <div className="text-center">
                              <span className="text-3xl">{achievement.icon}</span>
                              <p className={`text-xs mt-2 font-medium ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {achievement.name}
                              </p>
                              
                              {!unlocked && (
                                <div className="mt-2">
                                  <Progress value={progressPercent} className="h-1.5" />
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {progress} / {achievement.threshold}
                                  </p>
                                </div>
                              )}
                              
                              {unlocked && (
                                <Badge className="mt-2 text-[10px]" variant="default">
                                  +{achievement.points} bodů
                                </Badge>
                              )}
                            </div>
                            
                            {!unlocked && (
                              <div className="absolute top-2 right-2">
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{achievement.name}</p>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                          <p className="text-xs mt-1">Odměna: {achievement.points} bodů</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
