import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageRequestDialog } from '@/components/social/MessageRequestDialog';

/**
 * Dialog první zprávy je místo, kde dítě poprvé osloví někoho cizího.
 * Musí platit, že prázdná zpráva ani zpráva s odkazem se vůbec neodešle.
 */

function renderDialog(onSend = vi.fn()) {
  render(
    <MessageRequestDialog
      open
      onOpenChange={vi.fn()}
      recipientName="Tomáš"
      sending={false}
      onSend={onSend}
    />
  );
  return { onSend, sendButton: screen.getByRole('button', { name: /odeslat/i }) };
}

describe('MessageRequestDialog', () => {
  it('nedovolí odeslat prázdnou zprávu', () => {
    const { sendButton } = renderDialog();
    expect(sendButton).toBeDisabled();
  });

  it('nedovolí odeslat zprávu s odkazem', async () => {
    const user = userEvent.setup();
    const { sendButton } = renderDialog();

    await user.type(screen.getByRole('textbox'), 'ahoj napis mi na www.neco.cz');

    expect(sendButton).toBeDisabled();
    expect(screen.getByText(/nemůžou být odkazy/i)).toBeInTheDocument();
  });

  it('odešle běžnou zprávu bez mezer navíc', async () => {
    const user = userEvent.setup();
    const { onSend, sendButton } = renderDialog();

    await user.type(screen.getByRole('textbox'), '  Ahoj, jsem Kuba ze 4.B  ');
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);
    expect(onSend).toHaveBeenCalledWith('Ahoj, jsem Kuba ze 4.B');
  });
});
