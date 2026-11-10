import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';

export type AcaoAuditoria = 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT_LOTE';

type RegistroAuditoria = {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string;
  dadosAntes?: object;
  dadosDepois?: object;
};

const paraJson = (dados?: object) =>
  dados && (JSON.parse(JSON.stringify(dados)) as Prisma.InputJsonObject);

@Injectable()
export class AuditoriaService {
  // Recebe a transação de quem chama: a ação e o log são gravados juntos.
  async registrar(
    tx: Prisma.TransactionClient,
    usuario: UsuarioAutenticado,
    registro: RegistroAuditoria,
  ) {
    await tx.auditoria.create({
      data: {
        usuarioId: usuario.id,
        ip: usuario.ip,
        acao: registro.acao,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId,
        dadosAntes: paraJson(registro.dadosAntes),
        dadosDepois: paraJson(registro.dadosDepois),
      },
    });
  }
}
