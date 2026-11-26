import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';

// Máquina de estados do processo (RF-07). As transições abaixo são as únicas
// que as rotas de processos fazem; nenhuma outra parte do código deve mudar
// o status por conta própria.
//
// Ficam FORA desta tabela, de propósito (módulo de assinaturas):
// - aprovado -> aguardando_assinaturas: AssinaturasService.iniciarAssinaturas (#68)
// - aguardando_assinaturas -> concluido: na última assinatura (#65)

export type AcaoProcesso = 'enviar' | 'iniciar_analise' | 'apontar_pendencia' | 'aprovar';

export type Transicao = {
  // Status a partir dos quais a ação é permitida.
  de: readonly StatusProcesso[];
  para: StatusProcesso;
  // Único perfil que pode executar a ação.
  perfil: Perfil;
  // Completa a frase "Processo em <status> não pode ...".
  descricao: string;
};

export const TRANSICOES: Record<AcaoProcesso, Transicao> = {
  // rascunho -> enviado (primeiro envio) e pendencia -> enviado (reenvio).
  enviar: {
    de: [StatusProcesso.rascunho, StatusProcesso.pendencia],
    para: StatusProcesso.enviado,
    perfil: Perfil.REPRESENTANTE_UNDB,
    descricao: 'ser enviado',
  },
  iniciar_analise: {
    de: [StatusProcesso.enviado],
    para: StatusProcesso.em_analise,
    perfil: Perfil.COORDENACAO_SES,
    descricao: 'entrar em análise',
  },
  // em_analise -> pendencia e aprovado -> pendencia: a coordenação pode achar
  // erro nos dados depois de aprovar (ex.: geração do TCE com tce_incompleto).
  // Depois do /iniciar o status já é aguardando_assinaturas, então não há
  // devolução com assinatura em andamento.
  apontar_pendencia: {
    de: [StatusProcesso.em_analise, StatusProcesso.aprovado],
    para: StatusProcesso.pendencia,
    perfil: Perfil.COORDENACAO_SES,
    descricao: 'receber pendência',
  },
  aprovar: {
    de: [StatusProcesso.em_analise],
    para: StatusProcesso.aprovado,
    perfil: Perfil.COORDENACAO_SES,
    descricao: 'ser aprovado',
  },
};

export function podeTransicionar(acao: AcaoProcesso, status: StatusProcesso): boolean {
  return TRANSICOES[acao].de.includes(status);
}
