import mascotSleep from '@/assets/mascot-sleep.png';
import { NIGHT_TEXT } from '@/lib/childSafety';

/** Kamosféra v noci spí. Veľa zlého sa deje práve v noci. */
export function NightScreen() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0b1030] p-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(1px_1px_at_20px_30px,white,transparent),radial-gradient(1.5px_1.5px_at_120px_90px,#fde68a,transparent),radial-gradient(1px_1px_at_200px_160px,white,transparent)] [background-size:240px_200px]" />
      <span className="relative text-6xl">🌙</span>
      <img src={mascotSleep} alt="Spící robot" className="relative my-4 h-40 w-40 object-contain" />
      <h1 className="relative text-3xl font-black">Kamosféra spí 😴</h1>
      <p className="relative mt-2 max-w-sm text-white/80">
        Každou noc {NIGHT_TEXT} si Kamosféra odpočine — a ty taky. Ráno tu bude všechno, co ti kamarádi napíšou.
      </p>
      <p className="relative mt-6 max-w-sm rounded-2xl bg-white/10 px-4 py-3 text-sm">
        Když se něco děje a potřebuješ pomoc, řekni to rodiči nebo jinému dospělému, kterému věříš. 💛
      </p>
    </div>
  );
}
