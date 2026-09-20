import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface FlaggedPost {
  post_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  content_preview: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Viz translate-content: Groq místo Lovable gateway, protože ta patří
    // k projektu v Lovable Cloud a po přechodu na vlastní Supabase odpadá.
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Authenticate caller and require creator role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await authClient.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', claims.claims.sub)
      .eq('role', 'creator')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get posts from the last 24 hours that haven't been moderated yet
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, content, created_at, user_id')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(50); // Process 50 posts at a time

    if (postsError) {
      throw postsError;
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No new posts to moderate', flagged: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute per-user posting stats to detect spam (rapid-fire posting / duplicates)
    const byUser = new Map<string, typeof posts>();
    for (const p of posts) {
      const arr = byUser.get(p.user_id) ?? [];
      arr.push(p);
      byUser.set(p.user_id, arr);
    }

    const spamSignals: Record<string, { count_24h: number; burst_count: number; burst_window_seconds: number; duplicates: number }> = {};
    for (const [uid, arr] of byUser) {
      const sorted = [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let maxBurst = 1;
      let burstWindow = 0;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const diff = (new Date(sorted[j].created_at).getTime() - new Date(sorted[i].created_at).getTime()) / 1000;
          if (diff <= 300) {
            const c = j - i + 1;
            if (c > maxBurst) { maxBurst = c; burstWindow = diff; }
          } else break;
        }
      }
      const seen = new Map<string, number>();
      let dups = 0;
      for (const p of sorted) {
        const key = (p.content || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
        if (!key) continue;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        if (n > 1) dups++;
      }
      spamSignals[uid] = {
        count_24h: sorted.length,
        burst_count: maxBurst,
        burst_window_seconds: Math.round(burstWindow),
        duplicates: dups,
      };
    }

    // Prepare posts for AI analysis
    const postsForAnalysis = posts.map(p => ({
      id: p.id,
      user_id: p.user_id,
      created_at: p.created_at,
      content: p.content.substring(0, 500),
    }));

    // Call AI to analyze posts
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a content moderation AI. Analyze the following posts for inappropriate content including:
- Hate speech, discrimination, or slurs
- Explicit sexual content
- Violence or threats
- Harassment or bullying
- Spam or scam content (reklama, phishing, opakující se promo odkazy)
- SPAMMING BEHAVIOR: uživatel posílá příliš mnoho příspěvků v krátkém čase (např. 5+ za 5 minut) nebo opakuje stejný/podobný obsah. Použij spam_signals (count_24h, burst_count, burst_window_seconds, duplicates). Pokud burst_count >= 5 v pár minutách nebo duplicates >= 3, označ dané příspěvky jako spam s důvodem v češtině, např. "Spam: uživatel poslal X příspěvků za Y sekund" nebo "Spam: opakující se obsah".
- Illegal activity promotion

For each post that should be flagged, return post_id, reason (in Czech), severity (low/medium/high).
If no posts are problematic, return an empty array.
Only flag genuinely problematic content, not mild language or opinions.`
          },
          {
            role: "user",
            content: `spam_signals per user:\n${JSON.stringify(spamSignals, null, 2)}\n\nPosts to analyze:\n${JSON.stringify(postsForAnalysis, null, 2)}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_flagged_posts",
              description: "Report posts that contain inappropriate content",
              parameters: {
                type: "object",
                properties: {
                  flagged_posts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        post_id: { type: "string" },
                        reason: { type: "string" },
                        severity: { type: "string", enum: ["low", "medium", "high"] }
                      },
                      required: ["post_id", "reason", "severity"]
                    }
                  }
                },
                required: ["flagged_posts"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_flagged_posts" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq error:", response.status, errorText);
      throw new Error(`Groq error: ${response.status}`);
    }

    const aiResult = await response.json();
    
    // Parse the tool call result
    let flaggedPosts: FlaggedPost[] = [];
    
    if (aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        const args = JSON.parse(aiResult.choices[0].message.tool_calls[0].function.arguments);
        flaggedPosts = args.flagged_posts || [];
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Add content preview to flagged posts
    const enrichedFlaggedPosts = flaggedPosts.map(fp => {
      const post = posts.find(p => p.id === fp.post_id);
      return {
        ...fp,
        content_preview: post?.content?.substring(0, 100) || '',
        user_id: post?.user_id,
        created_at: post?.created_at,
      };
    });

    // If there are flagged posts, create notifications for creators
    if (enrichedFlaggedPosts.length > 0) {
      // Get all creators
      const { data: creators } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'creator');

      if (creators && creators.length > 0) {
        // Create notifications for each creator
        const notifications = creators.flatMap(creator => 
          enrichedFlaggedPosts.map(fp => ({
            user_id: creator.user_id,
            from_user_id: null,
            post_id: fp.post_id,
            type: 'moderation',
            message: `AI Moderace: ${fp.reason} (závažnost: ${fp.severity})`,
          }))
        );

        await supabase
          .from('notifications')
          .insert(notifications);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Analyzed ${posts.length} posts, flagged ${enrichedFlaggedPosts.length}`,
        flagged: enrichedFlaggedPosts,
        analyzed_count: posts.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Moderation error:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
