import type { RegistroAuditoria } from './auditoria.service.js';

// Leitura de dados pessoais de estagiários (RF-23 + LGPD): uma linha por
// estagiário exibido, para responder "quem viu os dados do estagiário X"
// com entidade = 'estagiario' e entidade_id = X. Só ids: o conteúdo lido
// (CPF, e-mail, endereço) não entra na auditoria.
export function registrosDeAcesso(
  estagiarios: { id: string }[],
  processoId: string,
): RegistroAuditoria[] {
  return estagiarios.map(({ id }) => ({
    acao: 'ACESSO',
    entidade: 'estagiario',
    entidadeId: id,
    dadosDepois: { processoId },
  }));
}
