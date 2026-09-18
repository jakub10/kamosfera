import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { REACTIONS, describeReactors, type ReactionKind } from '@/lib/reactions';

export interface Reactor {
  kind: ReactionKind;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

interface ReactionSummaryProps {
  reactors: Reactor[];
}

/**
 * Kdo reagoval — ne kolik jich bylo.
 *
 * V síti pár kamarádů ze školy je „Tomáš a Bára jsou s tebou" mnohem cennější
 * než „7". Navíc tím z aplikace mizí poslední místo, kde by se děti mohly mezi
 * sebou poměřovat — a žádné takové číslo nesmí přejít do Kamosvěta.
 */
export function ReactionSummary({ reactors }: ReactionSummaryProps) {
  if (reactors.length === 0) return null;

  // Projdeme v pevném pořadí z REACTIONS, ať skupiny neposkakují podle
  // toho, kdo kliknul dřív.
  const groups = REACTIONS.map((reaction) => ({
    reaction,
    people: reactors.filter((r) => r.kind === reaction.kind),
  })).filter((g) => g.people.length > 0);

  return (
    <ul className="flex flex-col gap-1.5 pt-2">
      {groups.map(({ reaction, people }) => (
        <li key={reaction.kind} className="flex items-center gap-2 text-sm">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm"
            style={{ backgroundColor: `color-mix(in srgb, ${reaction.tint} 18%, transparent)` }}
            aria-hidden="true"
          >
            {reaction.glyph}
          </span>

          <div className="flex -space-x-2" aria-hidden="true">
            {people.slice(0, 4).map((p) => (
              <Avatar key={p.user_id} className="h-6 w-6 border-2 border-card">
                <AvatarImage src={p.avatar_url || ''} />
                <AvatarFallback className="text-[10px]">
                  {p.full_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>

          <span className="min-w-0 truncate text-muted-foreground">
            {describeReactors(people.map((p) => p.full_name), reaction)}
          </span>
        </li>
      ))}
    </ul>
  );
}
