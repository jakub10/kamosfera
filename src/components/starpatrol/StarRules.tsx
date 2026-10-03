import { CARD_INFO, ROLE_INFO, type CardKind, type Role } from '@/games/starpatrol/api';
import { CardFace } from './CardFace';

const ROLES: Role[] = ['captain', 'crew', 'pirate', 'ai'];
const CARDS: CardKind[] = ['laser', 'shield', 'repair', 'salva', 'tractor', 'hyper', 'cloak'];

/** Jak se hraje — krátce, pro jedenáctileté. */
export function StarRules() {
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-black">Tajné role</h3>
        <p className="mb-2 text-muted-foreground">
          Každý dostane tajnou roli. Kapitána znají všichni, ostatní se musí prozradit činy.
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
          4 hráči: Kapitán, 2 piráti, AI · 5: + posádka · 6: + další pirát · 7: + další posádka
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-black">Tah</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Na začátku tahu si automaticky lížeš 2 karty.</li>
          <li>Zahraj, kolik karet chceš — ale laser jen jednou za tah.</li>
          <li>Na konci smíš mít v ruce nejvýš tolik karet, kolik máš energie.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          Každý má 4 energie (Kapitán 5). Na nule vypadáváš a tvoje role se odhalí. Na tah máš 45 sekund — kdo usne
          třikrát po sobě, vypadne.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-black">Dosah</h3>
        <p className="text-muted-foreground">
          Vzdálenost je, kolik míst je mezi vámi u stolu (kratší stranou). Sousedé jsou na 1. Na začátku máš
          dosah 1 — 🚀 Hyperpohon ho zvětší, 👻 Maskování tě od ostatních vzdálí.
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
          Za sestřeleného piráta dostaneš 3 karty. Kapitán, který sestřelí vlastní posádku, přijde o všechny karty!{' '}
          {CARD_INFO.shield.icon} Štít se zapne sám.
        </p>
      </section>
    </div>
  );
}
