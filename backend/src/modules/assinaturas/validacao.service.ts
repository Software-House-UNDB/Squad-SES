import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { calcularSha256 } from '../documentos/arquivo.js';
import { formatarCodigo, normalizarCodigo } from './codigo-validacao.js';

const naoEncontrado = () =>
  new NotFoundException({
    erro: 'codigo_nao_encontrado',
    motivo: 'Nenhum documento com este código de validação',
  });

// Validação pública de documento assinado (RF-17). Mostra o que comprova a
// assinatura (quem, em que papel, quando, método e nível) e nada de contato
// ou rastreio: sem e-mail, CPF, IP ou user-agent.
@Injectable()
export class ValidacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async consultar(entrada: string) {
    const documento = await this.buscar(entrada);
    const assinadas = documento.signatarios.filter((s) => s.assinatura);
    const pendentes = documento.signatarios.filter((s) => !s.assinatura);

    return {
      codigo: formatarCodigo(documento.codigoValidacao!),
      situacao: pendentes.length === 0 ? 'assinado' : 'pendente',
      documento: {
        tipo: documento.tipo,
        nomeArquivo: documento.nomeArquivo,
        hashSha256: documento.hashSha256,
      },
      assinaturas: assinadas.map(({ papel, nome, assinatura }) => ({
        papel,
        nome,
        assinadoEm: assinatura!.assinadoEm,
        metodo: assinatura!.metodo,
        nivel: assinatura!.nivel,
      })),
      pendentes: pendentes.map(({ papel }) => ({ papel })),
    };
  }

  // Confere se uma cópia do PDF é idêntica ao documento assinado.
  async verificarArquivo(entrada: string, conteudo: Buffer) {
    const documento = await this.buscar(entrada);
    const hashArquivo = calcularSha256(conteudo);
    return {
      confere: hashArquivo === documento.hashSha256,
      hashArquivo,
      hashDocumento: documento.hashSha256,
    };
  }

  private async buscar(entrada: string) {
    const codigo = normalizarCodigo(entrada);
    if (!codigo) throw naoEncontrado();
    const documento = await this.prisma.documento.findUnique({
      where: { codigoValidacao: codigo },
      select: {
        tipo: true,
        nomeArquivo: true,
        hashSha256: true,
        codigoValidacao: true,
        signatarios: {
          orderBy: { papel: 'asc' },
          select: {
            papel: true,
            nome: true,
            assinatura: { select: { assinadoEm: true, metodo: true, nivel: true } },
          },
        },
      },
    });
    if (!documento) throw naoEncontrado();
    return documento;
  }
}
