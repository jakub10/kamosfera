import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Ban, Lock, ShieldCheck } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import mascotWelcome from '@/assets/landing/mascot-welcome.webp';
import mascotCamera from '@/assets/landing/mascot-camera.webp';
import mascotChat from '@/assets/landing/mascot-chat.webp';
import mascotFriends from '@/assets/landing/mascot-friends.webp';
import mascotGaming from '@/assets/landing/mascot-gaming.webp';
import mascotThinking from '@/assets/landing/mascot-thinking.webp';
import mascotCelebrate from '@/assets/landing/mascot-celebrate.webp';
import mascotLock from '@/assets/landing/mascot-lock.webp';

/**
 * Úvodní stránka pro nepřihlášené — to, co uvidí rodič nebo kamarád,
 * když otevře kamosfera.online.
 *
 * Maskoti jsou tu jako malé webp kopie (src/assets/landing), protože
 * originální PNG mají přes 1 MB a stránka by se jinak načítala věčnost.
 * Videa leží v public/promo, zmenšená na 720p z vetvy s promem.
 */

interface LandingProps {
  onJoin: () => void;
  onLogin: () => void;
}

const FEATURES = [
  { img: mascotCamera, title: 'Příspěvky a stories', text: 'Sdílej fotky, videa a všechno, co tě zrovna baví.' },
  { img: mascotChat, title: 'Zprávy', text: 'Piš si s kámoši, posílej emoji a vtípky.' },
  { img: mascotFriends, title: 'Skupiny', text: 'Třída, kroužek, parta z fotbalu — každá má svůj koutek.' },
  { img: mascotGaming, title: 'Hry s partou', text: 'Hvězdná hlídka, Pevnost a nájezd, Kamostavba a další.' },
  { img: mascotThinking, title: 'AI kamarád Kamoš', text: 'Zeptej se na cokoliv nebo si s ním povídej nahlas.' },
  { img: mascotCelebrate, title: 'Odznaky a avatar', text: 'Poskládej si vlastního avatara a sbírej odznaky.' },
];

const SAFETY = [
  {
    icon: Lock,
    title: 'Jen opravdoví kámoši',
    text: 'Kamaráda si přidáš naživo nebo pozvánkou. Nikoho nejde vyhledat a nové členy pouští správce se souhlasem rodiče.',
  },
  {
    icon: ShieldCheck,
    title: 'Robot dává pozor',
    text: 'Než zprávu odešleš, AI strážce se zeptá „Opravdu to chceš poslat?" — a zprávu, která by ublížila, nedoručí.',
  },
  {
    icon: Ban,
    title: 'Tohle mi není příjemné',
    text: 'Jedním ťuknutím otravu zablokuješ a tvůj důvěrník se to dozví. V noci Kamosféra spí.',
  },
];

const VIDEOS = [
  { src: '/promo/kamosfera-papir.mp4', poster: '/promo/kamosfera-papir.jpg', label: 'Kamosféra za 30 sekund' },
  { src: '/promo/kamosfera-vesmir.mp4', poster: '/promo/kamosfera-vesmir.jpg', label: 'Vítej v Kamosféře' },
];

export function Landing({ onJoin, onLogin }: LandingProps) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Dvě videa se zvukem přes sebe nikdo neposlouchá — spuštění jednoho zastaví druhé.
  const pauseOthers = (index: number) => {
    videoRefs.current.forEach((video, i) => {
      if (video && i !== index) video.pause();
    });
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Horní lišta */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <a href="#" className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="" className="w-9 h-9 rounded-xl" />
            <span className="font-bold text-xl gradient-text truncate">Kamosféra</span>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onLogin}>Přihlásit se</Button>
            <Button onClick={onJoin} className="hidden sm:inline-flex">Přidej se</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-[hsl(var(--story-gradient-start)/0.15)]" />
        <div className="relative container mx-auto px-4 py-12 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-block rounded-full bg-primary/10 text-primary px-4 py-1 text-sm font-medium mb-5">
              Dětská sociální síť · zdarma
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-5">
              Všichni tví kámoši ze školy.{' '}
              <span className="gradient-text">Na jednom bezpečném místě.</span>
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
              Příspěvky, zprávy, skupiny, hry a AI kamarád. A robot, který dává pozor,
              aby tu bylo bezpečno.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button size="lg" onClick={onJoin} className="text-lg px-8">Přidej se</Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <a href="#video">▶ Mrkni na video</a>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--story-gradient-end)/0.35)] blur-2xl" />
            <div className="absolute inset-[6%] rounded-full border-2 border-dashed border-primary/30 animate-[spin_40s_linear_infinite] motion-reduce:animate-none" />
            <img
              src={mascotWelcome}
              alt="Kamoš, maskot Kamosféry, mává na pozdrav"
              className="relative w-full h-full object-contain drop-shadow-2xl animate-landing-float motion-reduce:animate-none"
            />
          </div>
        </div>
      </section>

      {/* Videa */}
      <section id="video" className="scroll-mt-16 container mx-auto px-4 py-16 lg:py-24">
        <h2 className="text-3xl lg:text-4xl font-bold text-center mb-3">Mrkni, jak to vypadá</h2>
        <p className="text-center text-muted-foreground mb-10">Pusť si zvuk 🔊</p>
        <div className="flex flex-col sm:flex-row gap-8 justify-center items-center">
          {VIDEOS.map((video, i) => (
            <figure key={video.src} className="w-64 lg:w-72">
              <div className="rounded-[2.5rem] bg-foreground p-2.5 shadow-2xl">
                <video
                  ref={(el) => (videoRefs.current[i] = el)}
                  src={video.src}
                  poster={video.poster}
                  controls
                  playsInline
                  preload="none"
                  onPlay={() => pauseOthers(i)}
                  className="block w-full aspect-[9/16] rounded-[2rem] bg-black object-cover"
                />
              </div>
              <figcaption className="text-center text-sm text-muted-foreground mt-3">{video.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Co tu najdeš */}
      <section className="bg-muted/50 py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-10">Co tu najdeš</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card rounded-3xl p-6 border border-border flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition">
                <img src={f.img} alt="" loading="lazy" className="w-20 h-20 object-contain shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold mb-1">{f.title}</h3>
                  <p className="text-muted-foreground text-sm">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bezpečí */}
      <section className="container mx-auto px-4 py-16 lg:py-24 grid lg:grid-cols-[auto_1fr] gap-10 items-center">
        <img src={mascotLock} alt="" loading="lazy" className="w-40 lg:w-56 mx-auto object-contain" />
        <div>
          <h2 className="text-3xl lg:text-4xl font-bold mb-2 text-center lg:text-left">Bezpečně. Pro děti i rodiče.</h2>
          <p className="text-muted-foreground mb-8 text-center lg:text-left">
            Pravidla hlídá aplikace i databáze — obejít prohlížeč nikomu nepomůže.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {SAFETY.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-7 w-7 text-primary mb-3" />
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Závěrečná výzva */}
      <section className="container mx-auto px-4 pb-16 lg:pb-24">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary to-[hsl(var(--story-gradient-end))] text-primary-foreground p-8 lg:p-14 text-center">
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">Tvůj svět. Tvoji kámoši.</h2>
          <p className="text-lg opacity-90 mb-8">Založ si účet za minutu a pozvi partu ze třídy.</p>
          <Button size="lg" variant="secondary" onClick={onJoin} className="text-lg px-10">
            Přidej se!
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <img src={logo} alt="" className="w-8 h-8 rounded-lg mx-auto mb-2" />
        Kamosféra · kamosfera.online
      </footer>
    </div>
  );
}
