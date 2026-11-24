import { NotFoundException } from '@nestjs/common';
import { PapelSignatario } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { calcularSha256 } from '../documentos/arquivo.js';
import { ValidacaoService } from './validacao.service.js';

const PDF = Buffer.from('%PDF-1.7 TCE da Ana');
const ASSINADO_EM = new Date('2026-11-24T13:00:00Z');
const assinatura = { assinadoEm: ASSINADO_EM, metodo: 'OTP', nivel: 'SIMPLES' };

const DOCUMENTO = {
  tipo: 'termo_compromisso',
  nomeArquivo: 'tce-ana.pdf',
  hashSha256: calcularSha256(PDF),
  codigoValidacao: '7K3M9QX2HV4T',
  signatarios: [
    { papel: PapelSignatario.DIRETOR_ESP, nome: 'Dra. Diretora', assinatura },
    { papel: PapelSignatario.ESTAGIARIO, nome: 'Ana Lima', assinatura: null },
  ],
};

function montar(documento: object | null = DOCUMENTO) {
  const prisma = { documento: { findUnique: vi.fn().mockResolvedValue(documento) } };
  const service = new ValidacaoService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('ValidacaoService.consultar', () => {
  it('normaliza o código, separa assinadas e pendentes e não expõe contato', async () => {
    const { service, prisma } = montar();

    const resposta = await service.consultar('7k3m-9qx2-hv4t');

    expect(prisma.documento.findUnique.mock.calls[0][0].where).toEqual({
      codigoValidacao: '7K3M9QX2HV4T',
    });
    expect(resposta).toEqual({
      codigo: '7K3M-9QX2-HV4T',
      situacao: 'pendente',
      documento: {
        tipo: 'termo_compromisso',
        nomeArquivo: 'tce-ana.pdf',
        hashSha256: DOCUMENTO.hashSha256,
      },
      assinaturas: [
        {
          papel: PapelSignatario.DIRETOR_ESP,
          nome: 'Dra. Diretora',
          assinadoEm: ASSINADO_EM,
          metodo: 'OTP',
          nivel: 'SIMPLES',
        },
      ],
      pendentes: [{ papel: PapelSignatario.ESTAGIARIO }],
    });
    const selecao = JSON.stringify(prisma.documento.findUnique.mock.calls[0][0].select);
    expect(selecao).not.toMatch(/"(email|cpf|ip|userAgent|storageKey|tokenHash|otpHash)"/);
  });

  it('com todos assinados, a situação é "assinado"', async () => {
    const { service } = montar({
      ...DOCUMENTO,
      signatarios: DOCUMENTO.signatarios.map((s) => ({ ...s, assinatura })),
    });

    expect((await service.consultar('7K3M9QX2HV4T')).situacao).toBe('assinado');
  });

  it('código mal formado responde 404 sem consultar o banco', async () => {
    const { service, prisma } = montar();

    await expect(service.consultar('abc')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.documento.findUnique).not.toHaveBeenCalled();
  });

  it('código desconhecido responde 404', async () => {
    const { service } = montar(null);

    await expect(service.consultar('7K3M9QX2HV4T')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ValidacaoService.verificarArquivo', () => {
  it('confere a cópia idêntica', async () => {
    const { service } = montar();

    await expect(service.verificarArquivo('7K3M9QX2HV4T', PDF)).resolves.toEqual({
      confere: true,
      hashArquivo: DOCUMENTO.hashSha256,
      hashDocumento: DOCUMENTO.hashSha256,
    });
  });

  it('acusa a cópia alterada', async () => {
    const { service } = montar();

    const resposta = await service.verificarArquivo('7K3M9QX2HV4T', Buffer.from('%PDF-1.7 outro'));

    expect(resposta.confere).toBe(false);
    expect(resposta.hashArquivo).not.toBe(DOCUMENTO.hashSha256);
  });
});
