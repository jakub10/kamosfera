import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Keď dospelý nie je pri dieťati: odkaz sa dá skopírovať a poslať. */
export function CopyLink({ link, label = 'Kopírovať odkaz' }: { link: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt('Skopíruj si odkaz:', link);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold hover:bg-muted"
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? 'Skopírované!' : label}
    </button>
  );
}
