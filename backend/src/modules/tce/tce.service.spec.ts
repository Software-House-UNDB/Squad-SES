import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  Perfil,
  StatusProcesso,
  TipoDocumento,
  TipoEstagio,
} from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { CONFIG_TCE, estagiarioCompleto } from '../../../test/fixtures/tce.js';
import type { RenderizadorPdfService } from './renderizador-pdf.service.js';
import { TceService } from './tce.service.js';

const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES, ip: '10.0.0.2' };
const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB, ip: '10.0.0.1' };

const PROCESSO = {
  id: 'p1',
  status: StatusProcesso.aprovado,
  tipoEstagio: TipoEstagio.obrigatorio,
  estagiarios: [
    estagiarioCompleto({ id: 'e1', nome: 'Ana Souza' }),
    estagiarioCompleto({ id: 'e2', nome: 'Bia Lima', cpf: '98765432100', matricula: '2026002' }),
  ],
};

// TCE enviado antes por upload do representante (provisório).
const TCE_ANTIGO = {
  id: 'antigo',
  processoId: 'p1',
  estagiarioId: 'e1',
  tipo: TipoDocumento.termo_compromisso,
  nomeArquivo: 'tce-ana.pdf',
  storageKey: 'processos/p1/antigo.pdf',
  enviadoPorId: 'rep',
};

const sha256 = (conteudo: Buffer) => createHash('sha256').update(conteudo).digest('hex');

function montar(config: Record<string, string | undefined> = CONFIG_TCE) {
  let sequencia = 0;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ status: StatusProcesso.aprovado }]),
    documento: {
      findMany: vi.fn().mockResolvedValue([TCE_ANTIGO]),
      delete: vi.fn(),
      create: vi.fn(({ data }) => Promise.resolve({ id: `novo${++sequencia}`, ...data })),
    },
    signatario: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    processo: { findUnique: vi.fn().mockResolvedValue(PROCESSO) },
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  };
  const storage = { enviar: vi.fn(), remover: vi.fn() };
  const auditoria = { registrar: vi.fn() };
  const renderizador = {
    renderizarTces: vi.fn((lista: { nome: string }[]) =>
      Promise.resolve(lista.map(({ nome }) => Buffer.from(`%PDF-1.4 TCE de ${nome}`))),
    ),
  };
  const service = new TceService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    auditoria as unknown as AuditoriaService,
    { get: (nome: string) => config[nome] } as unknown as ConfigService,
    renderizador as unknown as RenderizadorPdfService,
  );
  return { service, tx, prisma, storage, auditoria, renderizador };
}

async function respostaDe(promessa: Promise<unknown>) {
  const erro = await promessa.catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(HttpException);
  return {
    status: (erro as HttpException).getStatus(),
    corpo: (erro as HttpException).getResponse(),
  };
}

describe('TceService.gerar', () => {
  it('gera um TCE por estagiário e substitui o TCE enviado por upload', async () => {
    const { service, tx, storage, auditoria, renderizador } = montar();

    const resposta = await service.gerar('p1', COORDENACAO);

    expect(renderizador.renderizarTces).toHaveBeenCalledTimes(1);
    const [lista] = renderizador.renderizarTces.mock.calls[0];
    expect(lista.map((dados: { nome: string }) => dados.nome)).toEqual(['Ana Souza', 'Bia Lima']);

    expect(storage.enviar).toHaveBeenCalledTimes(2);
    const [chave, conteudo, mime, hash] = storage.enviar.mock.calls[0];
    expect(chave).toMatch(/^processos\/p1\/tce\/[0-9a-f-]{36}\.pdf$/);
    expect(mime).toBe('application/pdf');
    expect(hash).toBe(sha256(conteudo));

    expect(tx.documento.delete).toHaveBeenCalledWith({ where: { id: 'antigo' } });
    expect(tx.documento.create).toHaveBeenCalledTimes(2);
    expect(tx.documento.create.mock.calls[0][0].data).toMatchObject({
      processoId: 'p1',
      estagiarioId: 'e1',
      tipo: TipoDocumento.termo_compromisso,
      nomeArquivo: 'TCE - Ana Souza.pdf',
      mimeType: 'application/pdf',
      tamanhoBytes: conteudo.length,
      hashSha256: hash,
      storageKey: chave,
      enviadoPorId: 'coord',
    });

    expect(auditoria.registrar.mock.calls.map(([, , registro]) => registro.acao)).toEqual([
      'DELETE',
      'CREATE',
      'CREATE',
    ]);
    // O PDF antigo só sai do bucket depois do commit.
    expect(storage.remover).toHaveBeenCalledExactlyOnceWith('processos/p1/antigo.pdf');

    expect(resposta.substituidos).toBe(1);
    expect(resposta.tces).toHaveLength(2);
    expect(JSON.stringify(resposta)).not.toContain('storageKey');
  });

  it('trava o processo e confere o status de novo dentro da transação', async () => {
    const { service, tx, storage } = montar();
    tx.$queryRaw.mockResolvedValue([{ status: StatusProcesso.aguardando_assinaturas }]);

    const { status, corpo } = await respostaDe(service.gerar('p1', COORDENACAO));

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: 'status_invalido' });
    expect(tx.documento.create).not.toHaveBeenCalled();
    // Os PDFs novos, já no bucket, são apagados; o antigo fica.
    const enviados = storage.enviar.mock.calls.map(([chave]) => chave);
    expect(storage.remover.mock.calls.map(([chave]) => chave).sort()).toEqual(enviados.sort());
    expect(storage.remover).not.toHaveBeenCalledWith('processos/p1/antigo.pdf');
  });

  it('não substitui TCE que já tem signatário', async () => {
    const { service, tx, storage } = montar();
    tx.signatario.count.mockResolvedValue(4);

    const { status, corpo } = await respostaDe(service.gerar('p1', COORDENACAO));

    expect(status).toBe(409);
    expect(corpo).toMatchObject({ erro: 'documento_em_assinatura' });
    expect(tx.signatario.count).toHaveBeenCalledWith({
      where: { documentoId: { in: ['antigo'] } },
    });
    expect(tx.documento.delete).not.toHaveBeenCalled();
    expect(storage.remover).toHaveBeenCalledTimes(2);
  });

  it('falha no upload apaga o que já subiu e não abre a transação', async () => {
    const { service, tx, storage } = montar();
    storage.enviar.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('B2 fora'));

    await expect(service.gerar('p1', COORDENACAO)).rejects.toThrow('B2 fora');

    expect(storage.remover).toHaveBeenCalledExactlyOnceWith(storage.enviar.mock.calls[0][0]);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('só a coordenação gera', async () => {
    const { service, renderizador } = montar();

    const { status } = await respostaDe(service.gerar('p1', REPRESENTANTE));

    expect(status).toBe(403);
    expect(renderizador.renderizarTces).not.toHaveBeenCalled();
  });

  it('404 para processo inexistente', async () => {
    const { service, prisma } = montar();
    prisma.processo.findUnique.mockResolvedValue(null);

    expect((await respostaDe(service.gerar('p1', COORDENACAO))).status).toBe(404);
  });

  it.each([StatusProcesso.em_analise, StatusProcesso.aguardando_assinaturas])(
    'recusa processo em %s',
    async (situacao) => {
      const { service, prisma, renderizador } = montar();
      prisma.processo.findUnique.mockResolvedValue({ ...PROCESSO, status: situacao });

      const { status, corpo } = await respostaDe(service.gerar('p1', COORDENACAO));

      expect(status).toBe(409);
      expect(corpo).toMatchObject({ erro: 'status_invalido' });
      expect(renderizador.renderizarTces).not.toHaveBeenCalled();
    },
  );

  it('503 sem a configuração da instituição, antes de renderizar', async () => {
    const { service, renderizador } = montar({ ...CONFIG_TCE, TCE_IE_CNPJ: undefined });

    expect((await respostaDe(service.gerar('p1', COORDENACAO))).status).toBe(503);
    expect(renderizador.renderizarTces).not.toHaveBeenCalled();
  });

  it('400 tce_incompleto com os dados que faltam no lote', async () => {
    const { service, prisma, renderizador } = montar();
    prisma.processo.findUnique.mockResolvedValue({
      ...PROCESSO,
      estagiarios: [estagiarioCompleto({ id: 'e1', dataTermino: null })],
    });

    const { status, corpo } = await respostaDe(service.gerar('p1', COORDENACAO));

    expect(status).toBe(400);
    expect(corpo).toEqual({
      erro: 'tce_incompleto',
      pendencias: [
        { campo: 'dataTermino', motivo: 'data de término não informada', estagiarioId: 'e1' },
      ],
    });
    expect(renderizador.renderizarTces).not.toHaveBeenCalled();
  });
});
