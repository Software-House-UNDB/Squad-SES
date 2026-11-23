import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { queryClient } from '../../lib/queryClient.ts';
import * as servico from '../../services/analiseService.ts';
import { loginAs, renderWithProviders } from '../../test-utils.tsx';
import CorrecaoProcesso from './CorrecaoProcesso.tsx';

vi.mock('../../services/retornoService.ts', () => ({
  listarDocumentos: vi.fn().mockResolvedValue([]),
  removerDocumento: vi.fn(),
}));

vi.mock('../../services/analiseService.ts', async (original) => {
  const real = await original<typeof import('../../services/analiseService.ts')>();
  return {
    ...real,
    buscarProcessoParaAnalise: vi.fn(real.buscarProcessoParaAnalise),
    substituirDocumento: vi.fn(real.substituirDocumento),
    reenviarProcesso: vi.fn(real.reenviarProcesso),
  };
});

// Conteúdo único por arquivo: o mesmo conteúdo em dois documentos é tratado como arquivo repetido.
let sequencia = 0;
const pdf = (nome = 'corrigido.pdf') => new File([`conteudo-${sequencia++}`], nome, { type: 'application/pdf' });

const abrir = (id: string) => {
  loginAs('REPRESENTANTE_UNDB');
  return renderWithProviders(
    <Routes>
      <Route path="/gerenciamento/meus-processos/:id" element={<CorrecaoProcesso />} />
      <Route path="/gerenciamento/meus-processos" element={<p>Tela da lista</p>} />
    </Routes>,
    `/gerenciamento/meus-processos/${id}`,
  );
};

const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome });
const anexo = (rotulo: string) => screen.getByLabelText(`Anexar nova versão de ${rotulo}`);
const APOLICE = 'Apólice de seguro';
const DECLARACAO = 'Declaração do responsável (Bia Lima)';
const cartao = (titulo: string | RegExp) =>
  screen.getByText(titulo, { selector: 'strong' }).closest('li') as HTMLElement;

describe('CorrecaoProcesso', () => {
  beforeEach(() => {
    clearSession();
    queryClient.clear();
    servico.reiniciarBaseDeExemplo();
    vi.mocked(servico.buscarProcessoParaAnalise).mockClear();
    vi.mocked(servico.substituirDocumento).mockClear();
    vi.mocked(servico.reenviarProcesso).mockClear();
  });

  it('mostra o motivo da pendência só nos documentos devolvidos e trava o reenvio', async () => {
    const { container } = abrir('devolvido');
    expect(await screen.findByRole('heading', { name: 'Processo 2026/011' })).toBeInTheDocument();
    expect(container.querySelectorAll('.mp-doc--pendencia')).toHaveLength(2);

    const apolice = cartao('Apólice de seguro');
    expect(within(apolice).getByText('A apólice está vencida. Envie a vigente.')).toBeInTheDocument();
    expect(within(cartao('Plano de atividades')).queryByText(/Motivo da pendência/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Anexar nova versão de Plano de atividades')).not.toBeInTheDocument();

    expect(botao('Reenviar processo')).toBeDisabled();
    expect(screen.getByText(/Substitua os 2 documentos com pendência/)).toBeInTheDocument();
  });

  it('anexar a nova versão atualiza o documento e conta uma pendência a menos', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });

    await userEvent.upload(anexo(APOLICE), pdf('apolice-vigente.pdf'));

    await waitFor(() => expect(within(cartao(APOLICE)).getByText('Aguardando análise')).toBeInTheDocument());
    const apolice = cartao(APOLICE);
    expect(within(apolice).getByText(/apolice-vigente\.pdf/)).toHaveTextContent('versão 2');
    expect(within(apolice).queryByLabelText(`Anexar nova versão de ${APOLICE}`)).not.toBeInTheDocument();
    expect(screen.getByText(/Substitua o documento com pendência/)).toBeInTheDocument();
    expect(botao('Reenviar processo')).toBeDisabled();
  });

  it('com todas as pendências corrigidas, reenvia o processo e passa a só acompanhar', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), pdf());
    await waitFor(() => expect(screen.queryByLabelText(`Anexar nova versão de ${APOLICE}`)).not.toBeInTheDocument());
    await userEvent.upload(anexo(DECLARACAO), pdf());
    await waitFor(() => expect(botao('Reenviar processo')).toBeEnabled());
    expect(screen.getByText(/Todas as pendências foram corrigidas/)).toBeInTheDocument();

    await userEvent.click(botao('Reenviar processo'));
    const modal = screen.getByText(/os documentos já aprovados continuam/i);
    expect(modal).toBeInTheDocument();
    await userEvent.click(botao('Confirmar reenvio'));

    await waitFor(() => expect(servico.reenviarProcesso).toHaveBeenCalledWith('devolvido'));
    expect(await screen.findByText('Processo reenviado')).toBeInTheDocument();
    expect(screen.getAllByText('Enviado').length).toBeGreaterThan(0);
    expect(screen.getByText(/aguardando a coordenação da SES iniciar a análise/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar processo' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Anexar nova versão/)).not.toBeInTheDocument();
  });

  it('cancelar a confirmação não reenvia', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), pdf());
    await waitFor(() => expect(screen.queryByLabelText(`Anexar nova versão de ${APOLICE}`)).not.toBeInTheDocument());
    await userEvent.upload(anexo(DECLARACAO), pdf());
    await waitFor(() => expect(botao('Reenviar processo')).toBeEnabled());
    await userEvent.click(botao('Reenviar processo'));
    await userEvent.click(botao('Cancelar'));
    expect(servico.reenviarProcesso).not.toHaveBeenCalled();
    expect(screen.queryByText(/os documentos já aprovados continuam/i)).not.toBeInTheDocument();
  });

  it('recusa arquivo que não é PDF, sem chamar o serviço', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), new File(['x'], 'foto.png', { type: 'image/png' }), {
      applyAccept: false,
    });
    expect(await within(cartao(APOLICE)).findByRole('alert')).toHaveTextContent('Envie o arquivo em PDF');
    expect(servico.substituirDocumento).not.toHaveBeenCalled();
    expect(within(cartao(APOLICE)).getByText('Pendência')).toBeInTheDocument();
  });

  it('recusa arquivo acima do limite de 20 MB', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(grande, 'size', { value: 21 * 1024 * 1024 });
    await userEvent.upload(anexo(APOLICE), grande);
    expect(await within(cartao(APOLICE)).findByRole('alert')).toHaveTextContent('O limite é 20 MB');
    expect(servico.substituirDocumento).not.toHaveBeenCalled();
  });

  it('barra o mesmo arquivo anexado em dois documentos', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    const igual = new File(['mesmo-conteudo'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(anexo(APOLICE), igual);
    await waitFor(() => expect(screen.queryByLabelText(`Anexar nova versão de ${APOLICE}`)).not.toBeInTheDocument());
    await userEvent.upload(anexo(DECLARACAO), new File(['mesmo-conteudo'], 'b.pdf', { type: 'application/pdf' }));
    expect(await within(cartao('Declaração do responsável')).findByRole('alert')).toHaveTextContent(
      'Este arquivo já foi anexado em outro documento',
    );
    expect(within(cartao('Declaração do responsável')).getByText('Pendência')).toBeInTheDocument();
  });

  it('um erro some quando a próxima tentativa dá certo', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), new File(['x'], 'foto.png', { type: 'image/png' }), {
      applyAccept: false,
    });
    expect(await within(cartao(APOLICE)).findByRole('alert')).toBeInTheDocument();
    await userEvent.upload(anexo(APOLICE), pdf());
    await waitFor(() => expect(within(cartao(APOLICE)).queryByRole('alert')).not.toBeInTheDocument());
  });

  it('se o status mudou no servidor (409), avisa para recarregar', async () => {
    vi.mocked(servico.substituirDocumento).mockRejectedValueOnce(new servico.TransicaoInvalidaError());
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), pdf());
    expect(await within(cartao(APOLICE)).findByRole('alert')).toHaveTextContent('O status deste processo mudou');
  });

  it('falha inesperada ao anexar mantém tudo como estava', async () => {
    vi.mocked(servico.substituirDocumento).mockRejectedValueOnce(new Error('rede'));
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), pdf());
    expect(await within(cartao(APOLICE)).findByRole('alert')).toHaveTextContent('Nada foi alterado');
    expect(within(cartao(APOLICE)).getByText('Pendência')).toBeInTheDocument();
  });

  it('falha ao reenviar mostra o erro e mantém o processo devolvido', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), pdf());
    await waitFor(() => expect(screen.queryByLabelText(`Anexar nova versão de ${APOLICE}`)).not.toBeInTheDocument());
    await userEvent.upload(anexo(DECLARACAO), pdf());
    await waitFor(() => expect(botao('Reenviar processo')).toBeEnabled());
    vi.mocked(servico.reenviarProcesso).mockRejectedValueOnce(new Error('rede'));
    await userEvent.click(botao('Reenviar processo'));
    await userEvent.click(botao('Confirmar reenvio'));
    expect(await screen.findByText(/Não foi possível reenviar o processo/)).toBeInTheDocument();
    expect(screen.getAllByText('Pendência', { selector: '.badge' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Processo reenviado')).not.toBeInTheDocument();
  });

  it.each([
    ['demo', /aguardando a coordenação da SES iniciar a análise/],
    ['em-analise', /A coordenação da SES está analisando/],
    ['aprovado', /Aguardando as assinaturas do TCE/],
  ])('processo %s é só de leitura, com o aviso do status', async (id, aviso) => {
    abrir(id);
    await screen.findByRole('heading', { name: /^Processo 2026\// });
    expect(screen.getByText(aviso)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Anexar nova versão/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar processo' })).not.toBeInTheDocument();
  });

  it('em análise, a pendência ainda provisória não aparece nem pode ser trocada', async () => {
    abrir('em-analise');
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    // A coordenação marcou a apólice, mas ainda não devolveu o processo: nada a corrigir.
    expect(within(cartao(APOLICE)).getByText('Aguardando análise')).toBeInTheDocument();
    expect(within(cartao(APOLICE)).queryByText('Pendência')).not.toBeInTheDocument();
    expect(within(cartao(APOLICE)).queryByText(/Motivo da pendência/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Anexar nova versão/)).not.toBeInTheDocument();
  });

  it('processo inexistente', async () => {
    abrir('nao-existe');
    expect(await screen.findByRole('alert')).toHaveTextContent('Processo não encontrado.');
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Meus processos' }));
    expect(screen.getByText('Tela da lista')).toBeInTheDocument();
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'id "%s" na URL é processo não encontrado, sem quebrar a tela',
    async (id) => {
      abrir(id);
      expect(await screen.findByRole('alert')).toHaveTextContent('Processo não encontrado.');
    },
  );

  it('arquivo vazio é recusado antes de chamar o serviço', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), new File([], 'vazio.pdf', { type: 'application/pdf' }));
    expect(await within(cartao(APOLICE)).findByRole('alert')).toHaveTextContent('O arquivo está vazio');
    expect(servico.substituirDocumento).not.toHaveBeenCalled();
  });

  it('ao trocar de processo, erro, aviso e confirmação do anterior não ficam na tela', async () => {
    loginAs('REPRESENTANTE_UNDB');
    renderWithProviders(
      <Routes>
        <Route
          path="/gerenciamento/meus-processos/:id"
          element={
            <>
              <Link to="/gerenciamento/meus-processos/em-analise">ir para outro processo</Link>
              <CorrecaoProcesso />
            </>
          }
        />
      </Routes>,
      '/gerenciamento/meus-processos/devolvido',
    );
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    await userEvent.upload(anexo(APOLICE), new File(['x'], 'foto.png', { type: 'image/png' }), { applyAccept: false });
    expect(await within(cartao(APOLICE)).findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'ir para outro processo' }));
    await screen.findByRole('heading', { name: 'Processo 2026/012' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falha na carga mostra erro e permite tentar de novo', async () => {
    vi.mocked(servico.buscarProcessoParaAnalise).mockRejectedValueOnce(new Error('rede'));
    abrir('devolvido');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o processo');
    await userEvent.click(botao('Tentar de novo'));
    expect(await screen.findByRole('heading', { name: 'Processo 2026/011' })).toBeInTheDocument();
  });

  it('agrupa os documentos do processo e de cada estagiário', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: 'Processo 2026/011' });
    for (const grupo of ['Do processo', 'Ana Souza', 'Bia Lima']) {
      expect(screen.getByRole('region', { name: grupo })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: '← Meus processos' })).toHaveAttribute(
      'href',
      '/gerenciamento/meus-processos',
    );
  });

  it('processo aprovado mostra os retornos da SES ao representante, sem envio nem exclusão', async () => {
    abrir('aprovado');
    expect(await screen.findByRole('heading', { name: 'Documentos de retorno da SES' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar retorno' })).not.toBeInTheDocument();
  });

  it('processo devolvido (pendência) não mostra a área de retorno', async () => {
    abrir('devolvido');
    await screen.findByRole('heading', { name: /Processo 2026\/011/ });
    expect(screen.queryByRole('heading', { name: 'Documentos de retorno da SES' })).not.toBeInTheDocument();
  });
});
