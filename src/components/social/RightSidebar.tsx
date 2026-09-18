import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MembersList } from '@/components/social/MembersList';

/**
 * Pravý sloupec. Dřív tu byli vymyšlení lidé (Emma Wilson, David Chen)
 * a vymyšlená témata (#TechNews, 12,5K příspěvků) ze šablony — na první
 * obrazovce po přihlášení. Teď tu jsou skuteční lidé z Kamosféry.
 */
export function RightSidebar() {
  return (
    <aside className="hidden lg:block fixed right-0 top-0 h-screen w-80 bg-card border-l border-border p-4 overflow-y-auto">
      <div className="bg-secondary rounded-xl p-4">
        <h3 className="font-semibold mb-1">Kdo je v Kamosféře</h3>
        <p className="text-xs text-muted-foreground mb-4">Spolužáci a kamarádi, které tu můžeš potkat.</p>
        <MembersList limit={6} compact />
        <Button variant="ghost" className="w-full mt-4 text-primary" asChild>
          <Link to="/search">Zobrazit všechny</Link>
        </Button>
      </div>
    </aside>
  );
}
