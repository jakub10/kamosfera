import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuardConfirmDialog } from '@/components/GuardConfirmDialog';
import { askGuardConfirm } from '@/lib/guardConfirm';

describe('dialog strážce „Opravdu to chceš poslat?“', () => {
  it('ukáže důvod a vrátí odpověď dítěte', async () => {
    render(<GuardConfirmDialog />);
    let p!: Promise<boolean>;
    act(() => {
      p = askGuardConfirm('Vypadá to na osobní údaje.');
    });
    expect(await screen.findByText('Vypadá to na osobní údaje.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ano, poslat' }));
    await expect(p).resolves.toBe(true);
  });

  it('„Ne, upravím to“ zprávu neodešle', async () => {
    render(<GuardConfirmDialog />);
    let p!: Promise<boolean>;
    act(() => {
      p = askGuardConfirm('Mohlo by to zamrzet.');
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ne, upravím to' }));
    await expect(p).resolves.toBe(false);
  });
});
