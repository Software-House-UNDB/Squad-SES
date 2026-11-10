import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Perfil, TipoDocumento } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ProcessosService } from '../processos/processos.service.js';
import { calcularSha256 } from './arquivo.js';
import { DocumentosService } from './documentos.service.js';

const USUARIO = { id: 'u1', perfil: Perfil.REPRESENTANTE_UNDB };
const PDF = { buffer: Buffer.from('%PDF-1.7 conteúdo'), originalname: 'termo.pdf' };
const DOCUMENTO = {
  id: 'd1',
  processoId: 'p1',
  nomeArquivo: 'termo.pdf',
  mimeType: 'application/pdf',
  storageKey: 'processos/p1/chave.pdf',
};

function montar() {
  const tx = {
    estagiario: { findFirst: vi.fn().mockResolvedValue({ id: 'e1' }) },
    documento: {
      create: vi.fn(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      findFirst: vi.fn().mockResolvedValue(DOCUMENTO),
      delete: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: (operacao: (cliente: typeof tx) => unknown) => operacao(tx),
  };
  const storage = {
    enviar: vi.fn(),
    remover: vi.fn(),
    urlAssinada: vi.fn().mockResolvedValue('https://storage/assinada'),
  };
  const processos = { obterEditavel: vi.fn(), garantirAcesso: vi.fn() };
  const auditoria = { registrar: vi.fn() };
  const service = new DocumentosService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    processos as unknown as ProcessosService,
    auditoria as unknown as AuditoriaService,
  );
  return { tx, storage, processos, auditoria, service };
}

describe('DocumentosService.enviar', () => {
  it('sobe o PDF e persiste o hash SHA-256 do conteúdo', async () => {
    const { tx, storage, auditoria, service } = montar();

    const documento = await service.enviar(
      'p1',
      PDF,
      { tipo: TipoDocumento.termo_compromisso, estagiarioId: 'e1' },
      USUARIO,
    );

    const hash = calcularSha256(PDF.buffer);
    const [chave] = storage.enviar.mock.calls[0];
    expect(chave).toMatch(/^processos\/p1\/[0-9a-f-]{36}\.pdf$/);
    expect(storage.enviar).toHaveBeenCalledWith(chave, PDF.buffer, 'application/pdf', hash);
    expect(tx.documento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hashSha256: hash,
        storageKey: chave,
        tamanhoBytes: PDF.buffer.length,
        nomeArquivo: 'termo.pdf',
        enviadoPorId: 'u1',
      }),
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      tx,
      USUARIO,
      expect.objectContaining({ acao: 'CREATE', entidade: 'documento' }),
    );
    expect(documento).not.toHaveProperty('storageKey');
    expect(documento.hashSha256).toBe(hash);
  });

  it('rejeita o que não é PDF sem tocar no storage', async () => {
    const { storage, service } = montar();
    const png = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: 'foto.pdf' };

    await expect(
      service.enviar('p1', png, { tipo: TipoDocumento.anexo }, USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.enviar).not.toHaveBeenCalled();
  });

  it('não sobe arquivo para processo que não pode ser alterado', async () => {
    const { storage, processos, service } = montar();
    processos.obterEditavel.mockRejectedValue(new ConflictException());

    await expect(
      service.enviar('p1', PDF, { tipo: TipoDocumento.anexo }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.enviar).not.toHaveBeenCalled();
  });

  it('recusa estagiário de outro processo', async () => {
    const { tx, storage, service } = montar();
    tx.estagiario.findFirst.mockResolvedValue(null);

    await expect(
      service.enviar('p1', PDF, { tipo: TipoDocumento.anexo, estagiarioId: 'e9' }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.enviar).not.toHaveBeenCalled();
  });

  it('apaga o objeto se a gravação no banco falhar', async () => {
    const { tx, storage, service } = montar();
    tx.documento.create.mockRejectedValue(new Error('banco fora'));

    await expect(service.enviar('p1', PDF, { tipo: TipoDocumento.anexo }, USUARIO)).rejects.toThrow(
      'banco fora',
    );
    const [chave] = storage.enviar.mock.calls[0];
    expect(storage.remover).toHaveBeenCalledWith(chave);
  });
});

describe('DocumentosService.gerarUrl', () => {
  it('confere o acesso e devolve URL com validade de 5 minutos', async () => {
    const { storage, processos, service } = montar();
    const antes = Date.now();

    const { url, expiraEm } = await service.gerarUrl('p1', 'd1', USUARIO);

    expect(processos.garantirAcesso).toHaveBeenCalledWith('p1', USUARIO);
    expect(url).toBe('https://storage/assinada');
    expect(storage.urlAssinada).toHaveBeenCalledWith(
      DOCUMENTO.storageKey,
      'termo.pdf',
      'application/pdf',
      300,
    );
    expect(expiraEm.getTime() - antes).toBeGreaterThanOrEqual(300_000);
  });

  it('responde 404 para documento de outro processo', async () => {
    const { tx, service } = montar();
    tx.documento.findFirst.mockResolvedValue(null);

    await expect(service.gerarUrl('p1', 'd9', USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DocumentosService.remover', () => {
  it('apaga o registro, audita e depois remove o objeto', async () => {
    const { tx, storage, auditoria, service } = montar();

    await service.remover('p1', 'd1', USUARIO);

    expect(tx.documento.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      tx,
      USUARIO,
      expect.objectContaining({ acao: 'DELETE', entidadeId: 'd1' }),
    );
    expect(storage.remover).toHaveBeenCalledWith(DOCUMENTO.storageKey);
  });

  it('mantém a exclusão mesmo se o storage falhar', async () => {
    const { storage, service } = montar();
    storage.remover.mockRejectedValue(new Error('B2 fora'));

    await expect(service.remover('p1', 'd1', USUARIO)).resolves.toBeUndefined();
  });
});
