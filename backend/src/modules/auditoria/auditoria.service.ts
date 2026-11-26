import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AcaoAuditoria } from './acoes-auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';

export type { AcaoAuditoria } from './acoes-auditoria.js';

export type RegistroAuditoria = {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string;
  dadosAntes?: object;
  dadosDepois?: object;
};

// Sem id quando a ação não tem usuário autenticado (usuarioId é opcional na tabela).
type Autor = Pick<UsuarioAutenticado, 'ip'> & { id?: string };

const paraJson = (dados?: object) =>
  dados && (JSON.parse(JSON.stringify(dados)) as Prisma.InputJsonObject);

const linha = (usuario: Autor, registro: RegistroAuditoria) => ({
  usuarioId: usuario.id,
  ip: usuario.ip,
  acao: registro.acao,
  entidade: registro.entidade,
  entidadeId: registro.entidadeId,
  dadosAntes: paraJson(registro.dadosAntes),
  dadosDepois: paraJson(registro.dadosDepois),
});

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Escritas: recebe a transação de quem chama, e a ação e o log são gravados juntos.
  async registrar(tx: Prisma.TransactionClient, usuario: Autor, registro: RegistroAuditoria) {
    await tx.auditoria.create({ data: linha(usuario, registro) });
  }

  /**
   * Acessos (RF-23 + LGPD): login, leitura de dados pessoais e download.
   * Não há transação para acompanhar, então grava direto, várias linhas de
   * uma vez. Se a gravação falhar, o erro vai para o log e a leitura segue,
   * como no AuditoriaInterceptor: derrubar a consulta não desfaz o acesso.
   * Nunca coloque o conteúdo lido em dadosDepois (CPF, e-mail...): só ids e contexto.
   */
  async registrarAcesso(usuario: Autor, registros: RegistroAuditoria | RegistroAuditoria[]) {
    const lista = Array.isArray(registros) ? registros : [registros];
    if (lista.length === 0) return;
    try {
      await this.prisma.auditoria.createMany({
        data: lista.map((registro) => linha(usuario, registro)),
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar auditoria de ${lista[0].acao} em ${lista[0].entidade}`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }
}
