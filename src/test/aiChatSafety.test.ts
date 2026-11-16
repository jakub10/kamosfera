import { describe, expect, it, vi } from 'vitest';
import {
  BLOCKED_REPLY,
  HELP_REPLY,
  judgeVerdict,
  safeReply,
  sseOnce,
} from '../../supabase/functions/_shared/groq-chat';

const options = { feature: 'ai-chat', systemPrompt: 'buď milý', maxTokens: 100 };
const said = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

/** Falešný Groq: první volání je odpověď, druhé kontrolor. */
function groq(answer: Response, judge: Response | Error) {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(answer);
  if (judge instanceof Error) fn.mockRejectedValueOnce(judge);
  else fn.mockResolvedValueOnce(judge);
  return fn as unknown as typeof fetch;
}

describe('AI kamarád — model kontroluje model', () => {
  it('verdikt kontrolora: jen jasné OK pustí odpověď', () => {
    expect(judgeVerdict('OK')).toBe('ok');
    expect(judgeVerdict(' ok.')).toBe('ok');
    expect(judgeVerdict('STOP')).toBe('stop');
    expect(judgeVerdict('POMOC')).toBe('help');
    expect(judgeVerdict('OK, ale STOP')).toBe('stop');
    expect(judgeVerdict('')).toBe('stop');
    expect(judgeVerdict(undefined)).toBe('stop');
    expect(judgeVerdict('Myslím, že je to v pořádku')).toBe('stop');
  });

  it('schválená odpověď se dostane k dítěti', async () => {
    const r = await safeReply(groq(said('Ahoj! 🎉'), said('OK')), 'k', options, [{ role: 'user', content: 'ahoj' }]);
    expect(r).toEqual({ text: 'Ahoj! 🎉', verdict: 'ok' });
  });

  it('nevhodnou odpověď nahradí bezpečná věta', async () => {
    const r = await safeReply(groq(said('něco nevhodného'), said('STOP')), 'k', options, [{ role: 'user', content: 'x' }]);
    expect(r).toEqual({ text: BLOCKED_REPLY, verdict: 'stop' });
  });

  it('když dítě píše o něčem vážném, dostane odkaz na pomoc', async () => {
    const r = await safeReply(groq(said('to bude dobré'), said('POMOC')), 'k', options, [{ role: 'user', content: 'x' }]);
    expect(r).toEqual({ text: HELP_REPLY, verdict: 'help' });
    expect(HELP_REPLY).toContain('116 111');
  });

  it('když kontrola selže, odpověď se nepustí', async () => {
    const down = await safeReply(groq(said('odpověď'), new Response('', { status: 503 })), 'k', options, [{ role: 'user', content: 'x' }]);
    expect(down).toEqual({ text: BLOCKED_REPLY, verdict: 'judge_failed' });
    const err = await safeReply(groq(said('odpověď'), new Error('síť')), 'k', options, [{ role: 'user', content: 'x' }]);
    expect(err).toEqual({ text: BLOCKED_REPLY, verdict: 'judge_failed' });
  });

  it('kontrolor dostane zprávu dítěte i odpověď jako data', async () => {
    const fn = groq(said('odpověď AI'), said('OK'));
    await safeReply(fn, 'k', options, [
      { role: 'user', content: 'první' },
      { role: 'assistant', content: 'mezi' },
      { role: 'user', content: 'poslední zpráva' },
    ]);
    const body = JSON.parse((fn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[1][1].body as string);
    expect(JSON.parse(body.messages[1].content)).toEqual({ dite: 'poslední zpráva', odpoved: 'odpověď AI' });
    expect(body.temperature).toBe(0);
  });

  it('odpověď má tvar, který aplikace umí číst', () => {
    const lines = sseOnce('ahoj').split('\n').filter(Boolean);
    expect(JSON.parse(lines[0].slice(6)).choices[0].delta.content).toBe('ahoj');
    expect(lines[1]).toBe('data: [DONE]');
  });
});
