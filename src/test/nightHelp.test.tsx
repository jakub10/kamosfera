import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const askGuardianHelp = vi.fn();
vi.mock('@/lib/childSafety', () => ({
  NIGHT_TEXT: '22:00 – 6:30',
  askGuardianHelp: () => askGuardianHelp(),
}));

import { NightScreen } from '@/components/safety/NightScreen';

describe('noční obrazovka — pomoc nespí', () => {
  it('ukáže dětskou linku a 112 jako odkazy na vytočení', () => {
    render(<NightScreen />);
    expect(screen.getByRole('link', { name: /116 111/ })).toHaveAttribute('href', 'tel:116111');
    expect(screen.getByRole('link', { name: '112' })).toHaveAttribute('href', 'tel:112');
  });

  it('tlačítko pošle signál důvěrníkovi', async () => {
    askGuardianHelp.mockResolvedValueOnce({ guardian: true });
    render(<NightScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Potřebuju pomoct' }));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Odesláno důvěrníkovi'));
    expect(askGuardianHelp).toHaveBeenCalledTimes(1);
  });

  it('bez důvěrníka pošle dítě za dospělým a na linku', async () => {
    askGuardianHelp.mockResolvedValueOnce({ guardian: false });
    render(<NightScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Potřebuju pomoct' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Důvěrníka zatím nemáš'));
  });
});
