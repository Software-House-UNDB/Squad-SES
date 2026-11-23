import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { queryClient } from '../../lib/queryClient.ts';
import * as servico from '../../services/analiseService.ts';
import { loginAs, renderWithProviders } from '../../test-utils.tsx';
import MeusProcessos from './MeusProcessos.tsx';

vi.mock('../../services/analiseService.ts', async (original) => {
  const real = await original<typeof import('../../services/analiseService.ts')>();
  return { ...real, listarMeusProcessos: vi.fn(real.listarMeusProcessos) };
});

const abrir = () => {
  loginAs('REPRESENTANTE_UNDB');
  return renderWithProviders(
    <Routes>
      <Route path="/gerenciamento/meus-processos" element={<MeusProcessos />} />
      <Route path="/gerenciamento/meus-processos/:id" element={<p>Tela de correção</p>} />
      <Route path="/gerenciamento/novo-processo" element={<p>Tela de novo processo</p>} />
    </Routes>,
    '/gerenciamento/meus-processos',
  );
};

describe('MeusProcessos', () => {
  beforeEach(() => {
    clearSession();
    queryClient.clear();
    servico.reiniciarBaseDeExemplo();
    vi.mocked(servico.listarMeusProcessos).mockClear();
  });

  it('lista os processos com o devolvido primeiro e o avisa no topo', async () => {
    abrir();
    const tabela = await screen.findByRole('table', { name: 'Meus processos' });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);
    expect(within(linhas[0]).getByRole('rowheader')).toHaveTextContent('2026/011');
    expect(within(linhas[0]).getByText('Pendência')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('7 de 7 analisados')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 processo foi devolvido pela SES');
  });

  it('só o processo devolvido pede correção; os demais são só para ver', async () => {
    abrir();
    await screen.findByRole('table');
    expect(screen.getAllByRole('link', { name: /^Corrigir processo/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Corrigir processo 2026/011' })).toHaveAttribute(
      'href',
      '/gerenciamento/meus-processos/devolvido',
    );
    expect(screen.getByRole('link', { name: 'Ver processo 2026/014' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver processo 2026/009' })).toBeInTheDocument();
  });

  it('mostra as pendências só do processo devolvido; em análise a decisão ainda é provisória', async () => {
    abrir();
    const linhaDe = async (numero: string) =>
      (await screen.findByRole('rowheader', { name: numero })).closest('tr')!;
    expect(within(await linhaDe('2026/011')).getByText('2')).toBeInTheDocument();
    // 2026/012 está em análise com uma pendência provisória: não conta para o representante.
    expect(within(await linhaDe('2026/012')).getByText('—')).toBeInTheDocument();
  });

  it('o link leva à tela de correção', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('link', { name: 'Corrigir processo 2026/011' }));
    expect(screen.getByText('Tela de correção')).toBeInTheDocument();
  });

  it('sem processos, convida a criar o primeiro', async () => {
    vi.mocked(servico.listarMeusProcessos).mockResolvedValueOnce([]);
    abrir();
    expect(await screen.findByText('Você ainda não enviou nenhum processo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Novo processo' }));
    expect(screen.getByText('Tela de novo processo')).toBeInTheDocument();
  });

  it('com mais de um devolvido, o aviso usa o plural', async () => {
    const base = await servico.listarMeusProcessos();
    vi.mocked(servico.listarMeusProcessos).mockResolvedValueOnce(
      base.map((r) => ({ ...r, status: 'pendencia' as const })).slice(0, 2),
    );
    abrir();
    await screen.findByRole('table', { name: 'Meus processos' });
    expect(screen.getByRole('status')).toHaveTextContent('2 processos foram devolvidos');
  });

  it('falha na carga mostra erro e permite tentar de novo', async () => {
    vi.mocked(servico.listarMeusProcessos).mockRejectedValueOnce(new Error('rede'));
    abrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os seus processos');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Meus processos' })).toBeInTheDocument();
  });
});
