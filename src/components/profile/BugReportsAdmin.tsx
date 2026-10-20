import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Github, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { githubIssueUrl, GITHUB_REPO, type BugReportRow } from '@/lib/bugReport';
import { cn } from '@/lib/utils';

const STATUS: Record<BugReportRow['status'], { label: string; cls: string }> = {
  new: { label: 'nové', cls: 'bg-rose-500/15 text-rose-600' },
  sent: { label: 'na GitHubu', cls: 'bg-sky-500/15 text-sky-600' },
  done: { label: 'opraveno', cls: 'bg-emerald-500/15 text-emerald-600' },
  junk: { label: 'nesmysl', cls: 'bg-muted text-muted-foreground' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from('bug_reports');

/**
 * Panel tvůrce → Chyby. Hlášení od dětí se nejdřív přečtou tady (repozitář
 * je veřejný) a pak se jedním klikem založí issue na GitHubu.
 */
export function BugReportsAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<(BugReportRow & { reporter?: string })[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    let q = table().select('id, user_id, message, page, context, status, created_at').order('created_at', { ascending: false }).limit(100);
    if (!showAll) q = q.in('status', ['new', 'sent']);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Hlášení se nenačetla', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    const list = (data ?? []) as (BugReportRow & { user_id: string | null })[];
    const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ppl } = await supabase.from('profiles').select('user_id, username').in('user_id', ids);
      ppl?.forEach((p) => names.set(p.user_id, p.username));
    }
    setRows(list.map((r) => ({ ...r, reporter: r.user_id ? names.get(r.user_id) : undefined })));
  }, [showAll, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: number, status: BugReportRow['status']) => {
    const { error } = await table().update({ status }).eq('id', id);
    if (error) toast({ title: 'Nepovedlo se', description: error.message, variant: 'destructive' });
    else setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? prev);
  };

  const remove = async (id: number) => {
    const { error } = await table().delete().eq('id', id);
    if (error) toast({ title: 'Nepovedlo se', description: error.message, variant: 'destructive' });
    else setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
  };

  const toGithub = (r: BugReportRow) => {
    window.open(githubIssueUrl(r), '_blank', 'noopener');
    void setStatus(r.id, 'sent');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Zkontroluj, že v hlášení není jméno ani nic osobního — GitHub je veřejný. Pak klikni{' '}
          <b>Na GitHub</b> a na GitHubu <b>Submit new issue</b>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Jen otevřená' : 'Všechna'}
          </Button>
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Načíst znovu">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rows === null ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-muted-foreground" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Žádná hlášení. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className={cn('border-0', STATUS[r.status].cls)}>
                  {STATUS[r.status].label}
                </Badge>
                <span>#{r.id}</span>
                <span>{new Date(r.created_at).toLocaleString('cs-CZ')}</span>
                {r.reporter && <span>@{r.reporter}</span>}
                {r.page && <code className="rounded bg-muted px-1">{r.page}</code>}
                {!!r.context?.errors?.length && <span className="text-rose-600">{r.context.errors.length}× chyba v prohlížeči</span>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => toGithub(r)} className="gap-1">
                  <Github className="h-4 w-4" /> Na GitHub
                </Button>
                {r.status !== 'done' && (
                  <Button size="sm" variant="outline" onClick={() => void setStatus(r.id, 'done')} className="gap-1">
                    <Check className="h-4 w-4" /> Opraveno
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'junk')}>
                  Nesmysl
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(r.id)} aria-label="Smazat">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <a
        href={`https://github.com/${GITHUB_REPO}/issues`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline"
      >
        Všechny chyby na GitHubu <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
