import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal.tsx';

const fundo = () => screen.getByRole('dialog').parentElement as HTMLElement;

describe('Modal', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  const abrir = () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirmar" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    );
    return onClose;
  };

  it('clicar no fundo depois de aberto fecha o modal', () => {
    const onClose = abrir();
    vi.setSystemTime(Date.now() + 1000);
    fireEvent.mouseDown(fundo());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o 2º clique de um duplo clique no botão que abriu o modal não o fecha', () => {
    const onClose = abrir();
    // O botão que abriu o modal estava embaixo do fundo; o 2º clique do duplo clique cai nele.
    vi.setSystemTime(Date.now() + 150);
    fireEvent.mouseDown(fundo());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicar dentro do diálogo nunca fecha', () => {
    const onClose = abrir();
    vi.setSystemTime(Date.now() + 1000);
    fireEvent.mouseDown(screen.getByText('conteúdo'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc e o botão Fechar continuam funcionando logo ao abrir', async () => {
    const onClose = abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
