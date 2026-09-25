import { CARD_INFO, ROLE_INFO, type CardKind, type Role } from '@/games/starpatrol/api';
import { CardFace } from './CardFace';

const ROLES: Role[] = ['captain', 'crew', 'pirate', 'ai'];
const CARDS: CardKind[] = ['laser', 'shield', 'repair', 'salva', 'tractor', 'hyper', 'cloak'];

/** Ako sa hrá — krátko, pre 11-ročných. */
export function StarRules() {
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-black">Tajné roly</h3>
        <p className="mb-2 text-muted-foreground">
          Každý dostane tajnú rolu. Kapitána poznajú všetci, ostatní sa musia prezradiť činmi.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <li key={r} className="flex gap-2 rounded-xl border p-2">
              <span className="text-2xl">{ROLE_INFO[r].icon}</span>
              <span>
                <b>{ROLE_INFO[r].name}</b>
                <br />
                <span className="text-muted-foreground">{ROLE_INFO[r].goal}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          4 hráči: Kapitán, 2 piráti, AI · 5: + posádka · 6: + ďalší pirát · 7: + ďalšia posádka
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-black">Ťah</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Na začiatku ťahu si automaticky ťaháš 2 karty.</li>
          <li>Zahraj, koľko kariet chceš — ale laser len raz za ťah.</li>
          <li>Na konci smieš mať v ruke najviac toľko kariet, koľko máš energie.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          Každý má 4 energie (Kapitán 5). Na nule vypadáš a tvoja rola sa odhalí. Na ťah máš 45 sekúnd — kto zaspí
          trikrát po sebe, vypadne.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-black">Dosah</h3>
        <p className="text-muted-foreground">
          Vzdialenosť je, koľko miest je medzi vami pri stole (kratšou stranou). Susedia sú na 1. Na začiatku máš
          dosah 1 — 🚀 Hyperpohon ho zväčší, 👻 Maskovanie ťa od ostatných vzdiali.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-black">Karty</h3>
        <div className="flex flex-wrap gap-2">
          {CARDS.map((k) => (
            <CardFace key={k} kind={k} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Za zostreleného piráta dostaneš 3 karty. Kapitán, ktorý zostrelí vlastnú posádku, príde o všetky karty!{' '}
          {CARD_INFO.shield.icon} Štít sa zapne sám.
        </p>
      </section>
    </div>
  );
}
