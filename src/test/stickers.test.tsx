import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderVIPEmojis } from '@/components/social/VIPPostFeatures';
import { KAMOS_STICKERS } from '@/lib/stickers';

describe('nálepky Kamosféry', () => {
  it('nálepka v příspěvku není <img> — nejde přetáhnout ani uložit', () => {
    const { container } = render(<p>{renderVIPEmojis('ahoj [img:kamos-wave] jak je')}</p>);
    expect(container.querySelector('img')).toBeNull();
    const st = container.querySelector('[role="img"]')!;
    expect(st.getAttribute('aria-label')).toBe('Ahoj!');
    expect(st.className).toContain('select-none');
    expect(container.textContent).toBe('ahoj  jak je');
  });

  it('neznámý kód zůstane jako text', () => {
    const { container } = render(<p>{renderVIPEmojis('[img:neexistuje]')}</p>);
    expect(container.textContent).toBe('[img:neexistuje]');
  });

  it('kódy nálepek projdou kontrolou v databázi ([a-z0-9-]+) a jsou jedinečné', () => {
    const ids = KAMOS_STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^kamos-[a-z-]+$/);
  });
});
