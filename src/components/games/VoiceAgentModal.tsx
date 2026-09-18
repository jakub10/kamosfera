import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, X, Loader2, Volume2, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface VoiceAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Status = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type Message = { role: 'user' | 'assistant'; content: string };

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const MEMORY_KEY = 'kamosfera_voice_memory_cs';
const MAX_MEMORY_MESSAGES = 16;

const getStoredMemory = (): Message[] => {
  try {
    const saved = localStorage.getItem(MEMORY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Message[];
    return Array.isArray(parsed) ? parsed.filter((m) => m?.role && m?.content).slice(-MAX_MEMORY_MESSAGES) : [];
  } catch {
    return [];
  }
};

const saveStoredMemory = (messages: Message[]) => {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-MAX_MEMORY_MESSAGES)));
};

export function VoiceAgentModal({ isOpen, onClose }: VoiceAgentModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [memory, setMemory] = useState<Message[]>(() => getStoredMemory());

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis?.getVoices?.() || [];
    };

    loadVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stop();
      setTranscript('');
      setErrorMsg('');
    } else {
      setMemory(getStoredMemory());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function getCzechVoice() {
    const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis?.getVoices?.() || [];
    return (
      voices.find((voice) => voice.lang?.toLowerCase().startsWith('cs')) ||
      voices.find((voice) => /czech|češt|zuzana|iveta|hana/i.test(`${voice.name} ${voice.lang}`)) ||
      null
    );
  };

  function stopRecognitionOnly() {
    // Rozpoznávání řeči umí házet výjimky podle toho, v jakém je zrovna stavu.
    // Při úklidu nás to nezajímá — jde jen o to, aby přestalo poslouchat.
    try {
      if (recognitionRef.current?.onend) recognitionRef.current.onend = null;
    } catch {
      /* mikrofon už mohl být uvolněn */
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* rozpoznávání už neběží */
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* rozpoznávání už neběží */
    }
    recognitionRef.current = null;
  };

  function speak(text: string) {
    if (!activeRef.current || !text.trim()) return;

    window.speechSynthesis.cancel();
    speakingRef.current = true;
    setStatus('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'cs-CZ';
    const czechVoice = getCzechVoice();
    if (czechVoice) utterance.voice = czechVoice;
    utterance.rate = 0.94;
    utterance.pitch = 1.06;
    utterance.volume = 1;

    utterance.onend = () => {
      speakingRef.current = false;
      if (activeRef.current) startRecognition();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      if (activeRef.current) startRecognition();
    };

    window.speechSynthesis.speak(utterance);
  };

  async function askAssistant(userText: string) {
    const userMessage: Message = { role: 'user', content: userText };
    const nextMemory = [...memory, userMessage].slice(-MAX_MEMORY_MESSAGES);

    setMemory(nextMemory);
    saveStoredMemory(nextMemory);
    setTranscript((prev) => `${prev}${prev ? '\n' : ''}Ty: ${userText}\nKámoš: `);
    setStatus('thinking');

    let answer = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Musíš se přihlásit.');
      // Merge Czech instruction into the user message so AI answers the actual question
      const messagesWithLang = [
        ...memory,
        { role: 'user' as const, content: `${userText}\n(Odpověz stručně česky.)` },
      ];
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: messagesWithLang }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'AI odpověď se nepodařila');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '' || !line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              answer += content;
              setTranscript((prev) => prev + content);
            }
          } catch {
            // Stream can contain partial JSON chunks.
          }
        }
      }

      const cleanAnswer = answer.replace(/\s+/g, ' ').trim() || 'Rozumím. Řekni mi ještě kousek a navážu na to.';
      const stored = [...nextMemory, { role: 'assistant' as const, content: cleanAnswer }].slice(-MAX_MEMORY_MESSAGES);
      setMemory(stored);
      saveStoredMemory(stored);
      setTranscript((prev) => `${prev}\n`);
      speak(cleanAnswer);
    } catch (error) {
      console.error('Voice assistant error:', error);
      setErrorMsg(error instanceof Error ? error.message : t('voice.error'));
      setStatus('error');
      if (activeRef.current) {
        setTimeout(() => startRecognition(), 900);
      }
    }
  };

  function startRecognition() {
    if (!activeRef.current || speakingRef.current) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setErrorMsg('Tento prohlížeč nepodporuje české hlasové rozpoznávání. Zkus Chrome nebo Edge.');
      setStatus('error');
      return;
    }

    stopRecognitionOnly();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = 'cs-CZ';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setStatus('listening');
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript?.trim();
      if (last?.isFinal && text) {
        stopRecognitionOnly();
        askAssistant(text);
      }
    };
    recognition.onerror = (event) => {
      if (!activeRef.current) return;
      if (event.error === 'no-speech') {
        setStatus('listening');
        setTimeout(() => startRecognition(), 400);
        return;
      }
      setErrorMsg(event.error || t('voice.error'));
      setStatus('error');
    };
    recognition.onend = () => {
      if (activeRef.current && !speakingRef.current && status === 'listening') {
        setTimeout(() => startRecognition(), 350);
      }
    };

    try {
      recognition.start();
    } catch {
      // Recognition may already be starting; retry shortly.
      setTimeout(() => activeRef.current && startRecognition(), 500);
    }
  };

  async function start() {
    setErrorMsg('');
    activeRef.current = true;
    startRecognition();
  };

  function stop() {
    activeRef.current = false;
    speakingRef.current = false;
    stopRecognitionOnly();
    window.speechSynthesis?.cancel();
    setStatus('idle');
  };

  function clearMemory() {
    localStorage.removeItem(MEMORY_KEY);
    setMemory([]);
    setTranscript('');
  }

  if (!isOpen) return null;

  const isActive = status === 'listening' || status === 'thinking' || status === 'speaking';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-accent/40 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">{t('voice.title')}</h3>
              <p className="text-xs text-muted-foreground">🇨🇿 Čeština • paměť {memory.length > 0 ? 'zapnutá' : 'připravená'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Zavřít hlasového asistenta">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-muted/60 p-2">
              <Brain className="mx-auto mb-1 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Historie</span>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <Mic className="mx-auto mb-1 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">cs-CZ</span>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <Volume2 className="mx-auto mb-1 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Český hlas</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 pt-2">
            <div
              className={cn(
                'relative flex h-28 w-28 items-center justify-center rounded-full border transition-all',
                status === 'listening' && 'border-primary bg-primary/10 shadow-lg shadow-primary/20',
                status === 'speaking' && 'scale-105 border-primary bg-accent shadow-lg shadow-primary/20',
                status === 'thinking' && 'border-border bg-muted',
                (status === 'idle' || status === 'error') && 'border-border bg-muted'
              )}
            >
              {status === 'thinking' ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : isActive ? (
                <Mic className="h-10 w-10 text-primary" />
              ) : (
                <MicOff className="h-10 w-10 text-muted-foreground" />
              )}
              {status === 'listening' && <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping" />}
            </div>

            <p className="min-h-[20px] text-center text-sm text-muted-foreground">
              {status === 'idle' && t('voice.idle')}
              {status === 'listening' && 'Poslouchám česky…'}
              {status === 'thinking' && 'Přemýšlím a koukám do historie…'}
              {status === 'speaking' && 'Odpovídám českým hlasem…'}
              {status === 'error' && `${t('voice.error')}: ${errorMsg}`}
            </p>

            {transcript && (
              <div className="max-h-36 w-full overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                {transcript}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {!isActive ? (
                <Button onClick={start} size="lg" className="rounded-full px-8">
                  <Mic className="mr-2 h-5 w-5" /> {t('voice.start')}
                </Button>
              ) : (
                <Button onClick={stop} size="lg" variant="destructive" className="rounded-full px-8">
                  <MicOff className="mr-2 h-5 w-5" /> {t('voice.stop')}
                </Button>
              )}
              <Button onClick={clearMemory} size="lg" variant="outline" className="rounded-full px-5">
                Vymazat paměť
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
