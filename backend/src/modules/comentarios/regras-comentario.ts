import { ForbiddenException } from '@nestjs/common';
import { conflito } from '../../common/conflito.js';
import { Perfil, StatusProcesso, TipoComentario } from '../../generated/prisma/enums.js';

type Regra = { perfil: Perfil; quem: string; status: StatusProcesso[] };

// A coordenação comenta o que já foi enviado e ainda não foi aprovado (mesma regra
// do ProcessosService.analisar). Comentar não muda o status: a troca fica com a
// máquina de estados (RF-07).
const STATUS_DA_COORDENACAO: StatusProcesso[] = [
  StatusProcesso.enviado,
  StatusProcesso.em_analise,
  StatusProcesso.pendencia,
];

const DA_COORDENACAO: Omit<Regra, 'status'> = {
  perfil: Perfil.COORDENACAO_SES,
  quem: 'a coordenação SES',
};

// Quem pode escrever cada tipo, e com o processo em quais status (RF-12).
// O representante responde quando o processo voltou com pendência.
const REGRAS: Record<TipoComentario, Regra> = {
  [TipoComentario.pendencia]: { ...DA_COORDENACAO, status: STATUS_DA_COORDENACAO },
  [TipoComentario.observacao]: { ...DA_COORDENACAO, status: STATUS_DA_COORDENACAO },
  [TipoComentario.resposta]: {
    perfil: Perfil.REPRESENTANTE_UNDB,
    quem: 'o representante da UNDB',
    status: [StatusProcesso.pendencia],
  },
};

// O perfil vem antes do status: quem não pode escrever o tipo recebe 403 sem
// descobrir em que status o processo está.
export function exigirPodeComentar(perfil: Perfil, tipo: TipoComentario, status: StatusProcesso) {
  const regra = REGRAS[tipo];
  if (perfil !== regra.perfil) {
    throw new ForbiddenException(`Apenas ${regra.quem} registra comentário do tipo ${tipo}`);
  }
  if (!regra.status.includes(status)) {
    throw conflito(
      'status_invalido',
      `Processo em ${status} não aceita comentário do tipo ${tipo}`,
    );
  }
}
