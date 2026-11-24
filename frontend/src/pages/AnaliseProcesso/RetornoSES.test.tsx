import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import type { StatusProcesso } from '../../domain/processo.ts';
import { queryClient } from '../../lib/queryClient.ts';
import * as retorno from '../../services/retornoService.ts';
import * as upload from '../../services/uploadService.ts';
import { loginAs, renderWithProviders } from '../../test-utils.tsx';
import RetornoSES from './RetornoSES.tsx';

vi.mock('../../services/retornoService.ts', () => ({
  listarDocumentos: vi.fn(),
  removerDocumento: vi.fn(),
}));
vi.mock('../../services/uploadService.ts', async (original) => {
  const real = await original<typeof import('../../services/uploadService.ts')>();
  return { ...real, enviarDocumento: vi.fn() };
});

const CRIADOR = 'rep-1';
const doc = (id: string, enviadoPorId: string, nomeArquivo: string, tipo = 'oficio') => ({
  id,
  processoId: 'p1',
  estagiarioId: null,
  tipo,
  nomeArquivo,
  tamanhoBytes: 2048,
  hashSha256: 'a'.repeat(64),
  enviadoPorId,
  criadoEm: '2026-11-20T12:00:00.000Z',
});
const LISTA = [
  doc('d1', CRIADOR, 'plano.pdf', 'plano_atividades'),
  doc('d2', 'coord-1', 'oficio-carimbado.pdf'),
  doc('d3', 'coord-2', 'kit.pdf', 'kit_estagio'),
];
const pdf = () => new File(['%PDF-1.4'], 'novo-retorno.pdf', { type: 'application/pdf' });

function abrir(perfil: 'COORDENACAO_SES' | 'REPRESENTANTE_UNDB', status: StatusProcesso) {
  loginAs(perfil);
  return renderWithProviders(<RetornoSES processoId="p1" status={status} criadoPorId={CRIADOR} />);
}

describe('RetornoSES', () => {
  beforeEach(() => {
    clearSession();
    queryClient.clear();
    vi.mocked(retorno.listarDocumentos).mockReset().mockResolvedValue(structuredClone(LISTA));
    vi.mocked(retorno.removerDocumento).mockReset().mockResolvedValue(undefined);
    vi.mocked(upload.enviarDocumento).mockReset().mockResolvedValue({ id: 'novo', hashSha256: 'b' });
  });

  it('coordenação em aprovado vê só os retornos da SES, com selo, e o envio', async () => {
    abrir('COORDENACAO_SES', 'aprovado');
    expect(await screen.findByText('oficio-carimbado.pdf')).toBeInTheDocument();
    expect(screen.getByText('kit.pdf')).toBeInTheDocument();
    expect(screen.queryByText('plano.pdf')).not.toBeInTheDocument();
    expect(screen.getAllByText('Retorno da SES')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Enviar retorno' })).toBeInTheDocument();
  });

  it('o seletor de tipo oferece só os 4 tipos permitidos', async () => {
    abrir('COORDENACAO_SES', 'aguardando_assinaturas');
    const seletor = await screen.findByRole('combobox', { name: 'Tipo do documento' });
    expect(within(seletor).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Ofício',
      'Ofício de alteração',
      'Kit de estágio',
      'Anexo',
    ]);
  });

  it.each<StatusProcesso>(['rascunho', 'enviado', 'em_analise', 'pendencia'])(
    'não aparece nada em %s',
    async (status) => {
      const { container } = abrir('COORDENACAO_SES', status);
      expect(container).toBeEmptyDOMElement();
      expect(retorno.listarDocumentos).not.toHaveBeenCalled();
    },
  );

  it('em concluído lista os retornos mas fecha o envio e a exclusão', async () => {
    abrir('COORDENACAO_SES', 'concluido');
    expect(await screen.findByText('oficio-carimbado.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar retorno' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
  });

  it('coordenação exclui qualquer retorno da SES (inclusive de colega) e nunca o pacote da UNDB', async () => {
    abrir('COORDENACAO_SES', 'aprovado');
    await screen.findByText('kit.pdf');
    expect(screen.getByRole('button', { name: 'Excluir oficio-carimbado.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir kit.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /plano\.pdf/ })).not.toBeInTheDocument();
  });

  it('pede confirmação, remove e recarrega a lista', async () => {
    abrir('COORDENACAO_SES', 'aprovado');
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir kit.pdf' }));
    expect(retorno.removerDocumento).not.toHaveBeenCalled();
    vi.mocked(retorno.listarDocumentos).mockResolvedValue([LISTA[0], LISTA[1]]);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir documento' }));

    await waitFor(() => expect(retorno.removerDocumento).toHaveBeenCalledWith('p1', 'd3'));
    await waitFor(() => expect(screen.queryByText('kit.pdf')).not.toBeInTheDocument());
  });

  it('409 na exclusão mostra mensagem amigável', async () => {
    vi.mocked(retorno.removerDocumento).mockRejectedValue(new upload.ProcessoForaDoStatusError());
    abrir('COORDENACAO_SES', 'aprovado');
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir kit.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir documento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/status do processo mudou/);
  });

  it('403 na exclusão mostra mensagem amigável', async () => {
    vi.mocked(retorno.removerDocumento).mockRejectedValue(new upload.SemPermissaoError());
    abrir('COORDENACAO_SES', 'aprovado');
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir kit.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir documento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não tem permissão/);
  });

  it('envia o retorno com o tipo escolhido e recarrega a lista', async () => {
    abrir('COORDENACAO_SES', 'aprovado');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Tipo do documento' }), 'anexo');
    await userEvent.upload(screen.getByLabelText('Arquivo do retorno'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar retorno' }));

    await waitFor(() => expect(upload.enviarDocumento).toHaveBeenCalled());
    const [processoId, dados] = vi.mocked(upload.enviarDocumento).mock.calls[0];
    expect(processoId).toBe('p1');
    expect(dados).toMatchObject({ tipo: 'anexo' });
    expect(dados.arquivo.name).toBe('novo-retorno.pdf');
    await waitFor(() => expect(retorno.listarDocumentos).toHaveBeenCalledTimes(2));
  });

  it('não envia sem arquivo e recusa o que não é PDF', async () => {
    abrir('COORDENACAO_SES', 'aprovado');
    await screen.findByText('kit.pdf');
    expect(screen.getByRole('button', { name: 'Enviar retorno' })).toBeDisabled();
    await userEvent.upload(
      screen.getByLabelText('Arquivo do retorno'),
      new File(['x'], 'foto.png', { type: 'image/png' }),
      { applyAccept: false } as never,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/PDF/);
    expect(screen.getByRole('button', { name: 'Enviar retorno' })).toBeDisabled();
  });

  it.each([
    ['403', () => new upload.SemPermissaoError(), /não tem permissão/],
    ['409 de status', () => new upload.ProcessoForaDoStatusError(), /status do processo mudou/],
  ])('erro %s no envio mostra mensagem amigável e permite tentar de novo', async (_nome, erro, texto) => {
    vi.mocked(upload.enviarDocumento).mockRejectedValueOnce(erro());
    abrir('COORDENACAO_SES', 'aprovado');
    await userEvent.upload(await screen.findByLabelText('Arquivo do retorno'), pdf());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar retorno' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(upload.enviarDocumento).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('representante vê os retornos com selo, sem envio e sem excluir', async () => {
    abrir('REPRESENTANTE_UNDB', 'aprovado');
    expect(await screen.findByText('oficio-carimbado.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('Retorno da SES')).toHaveLength(2);
    expect(screen.queryByText('plano.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar retorno' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
  });

  it('erro ao carregar a lista mostra aviso e permite tentar de novo', async () => {
    vi.mocked(retorno.listarDocumentos).mockRejectedValueOnce(new Error('rede'));
    abrir('COORDENACAO_SES', 'aprovado');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível carregar/);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('kit.pdf')).toBeInTheDocument();
  });

  it('sem retornos ainda mostra o estado vazio', async () => {
    vi.mocked(retorno.listarDocumentos).mockResolvedValue([LISTA[0]]);
    abrir('COORDENACAO_SES', 'aprovado');
    expect(await screen.findByText('Nenhum documento de retorno enviado ainda.')).toBeInTheDocument();
  });
});
