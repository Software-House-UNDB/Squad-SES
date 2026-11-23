import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal.tsx';

const fundo = () => screen.getByRole('dialog').parentElement as HTMLElement;
// Um clique de verdade no fundo: o botão desce e sobe nele.
const clicarNoFundo = () => {
  fireEvent.mouseDown(fundo());
  fireEvent.click(fundo());
};

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
    clicarNoFundo();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('arrastar de dentro do diálogo e soltar no fundo não fecha (ex.: selecionar texto)', () => {
    const onClose = abrir();
    vi.setSystemTime(Date.now() + 1000);
    fireEvent.mouseDown(screen.getByText('conteúdo'));
    // Ao soltar fora, o navegador dispara o click no ancestral comum: o fundo.
    fireEvent.click(fundo());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('um clique que começou no fundo não vale para o próximo, que começa dentro', () => {
    const onClose = abrir();
    vi.setSystemTime(Date.now() + 1000);
    fireEvent.mouseDown(fundo());
    fireEvent.mouseDown(screen.getByText('conteúdo'));
    fireEvent.click(fundo());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('o 2º clique de um duplo clique no botão que abriu o modal não o fecha', () => {
    const onClose = abrir();
    // O botão que abriu o modal estava embaixo do fundo; o 2º clique do duplo clique cai nele.
    vi.setSystemTime(Date.now() + 150);
    clicarNoFundo();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicar dentro do diálogo nunca fecha', () => {
    const onClose = abrir();
    vi.setSystemTime(Date.now() + 1000);
    fireEvent.mouseDown(screen.getByText('conteúdo'));
    fireEvent.click(screen.getByText('conteúdo'));
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
