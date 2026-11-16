import { useState } from 'react';
import mascotSleep from '@/assets/mascot-sleep.webp';
import { askGuardianHelp, NIGHT_TEXT } from '@/lib/childSafety';

/** Dětská linka pomoci — stejné číslo v Česku (Linka bezpečí) i na Slovensku. */
export const CHILD_HELPLINE = '116 111';

/**
 * Kamosféra v noci spí. Veľa zlého sa deje práve v noci.
 *
 * Spí síť, ne pomoc: psát si v noci nejde, ale dítě, kterému je úzko nebo se
 * něco děje, tu musí najít cestu k člověku — důvěrníkovi, dětské lince, 112.
 */
export function NightScreen() {
  const [help, setHelp] = useState<'idle' | 'sending' | 'sent' | 'no-guardian' | 'failed'>('idle');

  const askHelp = async () => {
    setHelp('sending');
    try {
      const { guardian } = await askGuardianHelp();
      setHelp(guardian ? 'sent' : 'no-guardian');
    } catch {
      setHelp('failed');
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0b1030] p-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(1px_1px_at_20px_30px,white,transparent),radial-gradient(1.5px_1.5px_at_120px_90px,#fde68a,transparent),radial-gradient(1px_1px_at_200px_160px,white,transparent)] [background-size:240px_200px]" />
      <span className="relative text-6xl">🌙</span>
      <img src={mascotSleep} alt="Spící robot" className="relative my-4 h-40 w-40 object-contain [@media(max-height:720px)]:h-24 [@media(max-height:720px)]:w-24" />
      <h1 className="relative text-3xl font-black">Kamosféra spí 😴</h1>
      <p className="relative mt-2 max-w-sm text-white/80">
        Každou noc {NIGHT_TEXT} si Kamosféra odpočine — a ty taky. Ráno tu bude všechno, co ti kamarádi napíšou.
      </p>

      <section aria-label="Pomoc v noci" className="relative mt-6 w-full max-w-sm rounded-2xl bg-white/10 px-4 py-4 text-sm">
        <h2 className="text-base font-bold">Je ti úzko nebo se něco děje? 💛</h2>
        <p className="mt-1 text-white/80">Pomoc nespí. Nejsi na to sám/sama.</p>

        <button
          type="button"
          onClick={() => void askHelp()}
          disabled={help === 'sending' || help === 'sent'}
          className="mt-3 w-full rounded-full bg-amber-300 px-5 py-3 font-bold text-[#0b1030] disabled:opacity-70"
        >
          {help === 'sending' ? 'Posílám…' : help === 'sent' ? 'Odesláno důvěrníkovi ✓' : 'Potřebuju pomoct'}
        </button>
        <p className="mt-2 min-h-[2.5rem] text-white/80" role="status">
          {help === 'idle' && 'Tlačítko pošle signál tvému důvěrníkovi. Když to spěchá, vzbuď dospělého nebo zavolej.'}
          {help === 'sent' && 'Důvěrník signál uvidí, až se podívá. Nečekej na to — jdi za dospělým, kterému věříš, nebo zavolej na linku níže.'}
          {help === 'no-guardian' && 'Důvěrníka zatím nemáš. Vzbuď rodiče nebo jiného dospělého, kterému věříš — nebo zavolej na linku níže.'}
          {help === 'failed' && 'Nepovedlo se to odeslat. Vzbuď dospělého, kterému věříš, nebo zavolej na linku níže.'}
        </p>

        <a
          href="tel:116111"
          className="mt-2 block w-full rounded-full border border-white/40 px-5 py-3 font-bold"
        >
          📞 Dětská linka {CHILD_HELPLINE}
        </a>
        <p className="mt-2 text-white/80">Zdarma, ve dne i v noci, v Česku i na Slovensku. Můžeš mluvit o čemkoli.</p>

        <p className="mt-3 text-white/80">
          Když jde o život nebo zdraví, volej{' '}
          <a href="tel:112" className="font-bold underline">
            112
          </a>
          .
        </p>
      </section>
    </div>
  );
}
