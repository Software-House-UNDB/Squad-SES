import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { queryClient } from '../../lib/queryClient.ts';
import * as servico from '../../services/analiseService.ts';
import { loginAs, renderWithProviders } from '../../test-utils.tsx';
import AnaliseProcesso from './AnaliseProcesso.tsx';

vi.mock('../../services/analiseService.ts', async (original) => {
  const real = await original<typeof import('../../services/analiseService.ts')>();
  return {
    ...real,
    buscarProcessoParaAnalise: vi.fn(real.buscarProcessoParaAnalise),
    concluirAnalise: vi.fn(real.concluirAnalise),
  };
});

const abrir = (id: string) => {
  loginAs('COORDENACAO_SES');
  return renderWithProviders(
    <Routes>
      <Route path="/gerenciamento/processos/:id" element={<AnaliseProcesso />} />
    </Routes>,
    `/gerenciamento/processos/${id}`,
  );
};

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome });
const naLista = (nome: RegExp) => within(screen.getByRole('navigation', { name: 'Documentos do processo' })).getByRole('button', { name: nome });

describe('AnaliseProcesso', () => {
  beforeEach(() => {
    clearSession();
    queryClient.clear();
    servico.reiniciarBaseDeExemplo();
    vi.mocked(servico.concluirAnalise).mockClear();
  });

  it('abre um processo enviado e só libera as decisões depois de iniciar a análise', async () => {
    abrir('demo');
    expect(await screen.findByRole('heading', { name: 'Processo 2026/014' })).toBeInTheDocument();
    expect(screen.getAllByText('Enviado').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Aprovar documento' })).not.toBeInTheDocument();
    expect(screen.getByText(/Inicie a análise para decidir/)).toBeInTheDocument();

    await userEvent.click(botao('Iniciar análise'));
    expect(await screen.findByRole('button', { name: 'Aprovar documento' })).toBeInTheDocument();
    expect(screen.getAllByText('Em análise').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Iniciar análise' })).not.toBeInTheDocument();
  });

  it('mostra metadados e hash do documento selecionado', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    await userEvent.click(naLista(/Plano de atividades/));
    expect(screen.getByText('plano-atividades.pdf')).toBeInTheDocument();
    expect(screen.getByText(/^[0-9a-f]{64}$/)).toBeInTheDocument();
  });

  it('pendência sem comentário é recusada e nada muda', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    await userEvent.click(naLista(/Documentos pessoais.*Ana|Ana Souza/));
    await userEvent.click(botao('Apontar pendência'));
    await userEvent.type(screen.getByLabelText('Comentário da pendência'), '   ');
    await userEvent.click(botao('Registrar pendência'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Explique o que precisa/);
    expect(screen.getByText('3 de 7 analisados')).toBeInTheDocument();
  });

  it('registra pendência comentada e mostra o comentário no documento', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    await userEvent.click(naLista(/Ana Souza/));
    await userEvent.click(botao('Apontar pendência'));
    await userEvent.type(screen.getByLabelText('Comentário da pendência'), 'CPF ilegível');
    await userEvent.click(botao('Registrar pendência'));
    await waitFor(() => expect(screen.getByText('4 de 7 analisados')).toBeInTheDocument());
    await userEvent.click(naLista(/Ana Souza/));
    expect(screen.getByText('CPF ilegível')).toBeInTheDocument();
  });

  it('aprovar o processo só habilita com todos aprovados e pede confirmação', async () => {
    abrir('demo');
    await screen.findByRole('heading', { name: 'Processo 2026/014' });
    await userEvent.click(botao('Iniciar análise'));
    await screen.findByRole('button', { name: 'Aprovar documento' });
    expect(botao('Aprovar processo')).toBeDisabled();

    for (let i = 0; i < 7; i++) {
      await userEvent.click(botao('Aprovar documento'));
      await waitFor(() => expect(screen.getByText(`${i + 1} de 7 analisados`)).toBeInTheDocument());
    }
    expect(botao('Aprovar processo')).toBeEnabled();

    await userEvent.click(botao('Aprovar processo'));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar aprovação' }));
    expect(await screen.findAllByText('Aguardando assinaturas')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Aprovar documento' })).not.toBeInTheDocument();
  });

  it('devolver com pendência só habilita com ao menos uma pendência', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    expect(botao('Devolver com pendência')).toBeEnabled();

    // Aprovar a apólice (única pendência) desfaz a pendência.
    await userEvent.click(naLista(/Apólice de seguro/));
    await userEvent.click(botao('Aprovar documento'));
    await waitFor(() => expect(botao('Devolver com pendência')).toBeDisabled());
  });

  it('devolve o processo para a UNDB e fica somente leitura', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    await userEvent.click(botao('Devolver com pendência'));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Apólice de seguro/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Devolver processo' }));
    expect((await screen.findAllByText('Pendência')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Aprovar documento' })).not.toBeInTheDocument();
    expect(screen.getByText(/aguardando a correção da UNDB/i)).toBeInTheDocument();
  });

  it('processo já aprovado abre somente leitura', async () => {
    abrir('aprovado');
    await screen.findByRole('heading', { name: 'Processo 2026/009' });
    expect(screen.queryByRole('button', { name: 'Aprovar documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar processo' })).not.toBeInTheDocument();
  });

  it('processo inexistente mostra mensagem e permite tentar de novo', async () => {
    abrir('nao-existe');
    expect(await screen.findByText('Processo não encontrado.')).toBeInTheDocument();
    expect(botao('Tentar de novo')).toBeInTheDocument();
  });

  it('erro ao carregar mostra mensagem e recarrega ao tentar de novo', async () => {
    vi.mocked(servico.buscarProcessoParaAnalise).mockRejectedValueOnce(new Error('rede'));
    abrir('demo');
    expect(await screen.findByText(/Não foi possível carregar o processo/)).toBeInTheDocument();
    await userEvent.click(botao('Tentar de novo'));
    expect(await screen.findByRole('heading', { name: 'Processo 2026/014' })).toBeInTheDocument();
  });

  it('falha ao concluir mantém o status e avisa', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    vi.mocked(servico.concluirAnalise).mockRejectedValueOnce(new Error('rede'));
    await userEvent.click(botao('Devolver com pendência'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Devolver processo' }));
    expect(await screen.findByText(/Não foi possível concluir a análise/)).toBeInTheDocument();
    expect(screen.getAllByText('Em análise').length).toBeGreaterThan(0);
  });
});
