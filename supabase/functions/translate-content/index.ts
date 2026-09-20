// Translates user-generated content (posts, comments) to a target language
// using Lovable AI Gateway. No DB writes — pure proxy.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANG_NAMES: Record<string, string> = {
  cs: 'Czech',
  sk: 'Slovak',
  en: 'English',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Groq, ne Lovable gateway: klíč k té bráně patří k projektu v Lovable
    // Cloud a s přechodem na vlastní Supabase by přestal platit. Groq už
    // stejně pohání AI kamaráda (viz _shared/groq-chat.ts), takže tu je
    // jeden klíč místo dvou.
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '').slice(0, 4000);
    const targetLang = String(body.targetLang ?? 'en');

    if (!text.trim()) {
      return new Response(JSON.stringify({ translated: '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetName = LANG_NAMES[targetLang] ?? 'English';

    // Preserve [img:xxx] tokens — strip, translate, re-insert in order
    const tokens: string[] = [];
    const placeholderText = text.replace(/\[img:[a-z-]+\]/g, (m) => {
      tokens.push(m);
      return `__IMG${tokens.length - 1}__`;
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You translate user-generated social media posts to ${targetName}. Preserve emojis, hashtags, mentions, and any __IMG\\d+__ placeholders exactly. Output ONLY the translated text, no quotes, no explanations.`,
          },
          { role: 'user', content: placeholderText },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq error:', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Groq error: ${response.status}`);
    }

    const data = await response.json();
    let translated: string = data.choices?.[0]?.message?.content ?? '';

    // Restore tokens
    translated = translated.replace(/__IMG(\d+)__/g, (_m, idx) => tokens[Number(idx)] ?? '');

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('translate-content error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
