// Regras da análise documento a documento feita pela coordenação da SES (RF-07, RF-08, RF-12).
// Funções puras: a tela só pergunta "posso?"; a máquina de estados de verdade fica no backend.

import type { BadgeVariant } from '../../components/ui/Badge.tsx';

export type StatusProcesso =
  | 'rascunho'
  | 'enviado'
  | 'em_analise'
  | 'pendencia'
  | 'aprovado'
  | 'aguardando_assinaturas'
  | 'concluido';

export type DecisaoDoc = 'pendente' | 'aprovado' | 'pendencia';

export type TipoComentario = 'pendencia' | 'observacao' | 'resposta';

export interface Comentario {
  id: string;
  autor: string;
  tipo: TipoComentario;
  texto: string;
  /** ISO 8601 em UTC. */
  criadoEm: string;
}

export interface DocumentoAnalise {
  id: string;
  rotulo: string;
  tipo: string;
  /** Nome do estagiário dono do documento; ausente = documento do processo inteiro. */
  estagiario?: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  hashSha256: string;
  versao: number;
  decisao: DecisaoDoc;
  comentarios: Comentario[];
}

export interface ProcessoAnalise {
  id: string;
  numero: string;
  status: StatusProcesso;
  instituicao: string;
  enviadoEm: string;
  estagiarios: number;
  documentos: DocumentoAnalise[];
}

export const STATUS_LABEL: Record<StatusProcesso, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_analise: 'Em análise',
  pendencia: 'Pendência',
  aprovado: 'Aprovado',
  aguardando_assinaturas: 'Aguardando assinaturas',
  concluido: 'Concluído',
};

/** Cor do selo de cada status do processo. */
export const STATUS_BADGE: Record<StatusProcesso, BadgeVariant> = {
  rascunho: 'neutral',
  enviado: 'pending',
  em_analise: 'pending',
  pendencia: 'rejected',
  aprovado: 'approved',
  aguardando_assinaturas: 'approved',
  concluido: 'closed',
};

/** Data no formato brasileiro, no fuso de São Paulo. */
export const formatarData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export const DECISAO_LABEL: Record<DecisaoDoc, string> = {
  pendente: 'Não analisado',
  aprovado: 'Aprovado',
  pendencia: 'Pendência',
};

export const LIMITE_COMENTARIO = 1000;

export function progresso(docs: DocumentoAnalise[]) {
  return { analisados: docs.filter((d) => d.decisao !== 'pendente').length, total: docs.length };
}

/** A coordenação só decide documentos enquanto o processo está em análise. */
export function podeDecidir(status: StatusProcesso): boolean {
  return status === 'em_analise';
}

/** RF-08: pacote incompleto ou com pendência não avança. */
export function podeAprovarProcesso(status: StatusProcesso, docs: DocumentoAnalise[]): boolean {
  return podeDecidir(status) && docs.length > 0 && docs.every((d) => d.decisao === 'aprovado');
}

export function podeDevolverProcesso(status: StatusProcesso, docs: DocumentoAnalise[]): boolean {
  return podeDecidir(status) && docs.some((d) => d.decisao === 'pendencia');
}

export function documentosComPendencia(docs: DocumentoAnalise[]): DocumentoAnalise[] {
  return docs.filter((d) => d.decisao === 'pendencia');
}

/** Texto do comentário de pendência mais recente do documento; `null` se não houver. */
export function ultimaPendencia(doc: DocumentoAnalise): string | null {
  return doc.comentarios.filter((c) => c.tipo === 'pendencia').at(-1)?.texto ?? null;
}

/**
 * Decisão como o representante a enxerga. Uma pendência só vale depois que a SES devolve o
 * processo; antes disso é decisão provisória da coordenação (que ainda pode mudá-la) e não
 * pede nenhuma ação da UNDB, então aparece como "não analisado".
 */
export function decisaoVisivel(status: StatusProcesso, decisao: DecisaoDoc): DecisaoDoc {
  return decisao === 'pendencia' && status !== 'pendencia' ? 'pendente' : decisao;
}

/** O representante só troca o arquivo de um documento em pendência, com o processo devolvido (RF-12). */
export function podeSubstituir(status: StatusProcesso, doc: DocumentoAnalise): boolean {
  return status === 'pendencia' && doc.decisao === 'pendencia';
}

/** RF-07/RF-08: o reenvio (pendencia → enviado) só acontece com todas as pendências corrigidas. */
export function podeReenviar(status: StatusProcesso, docs: DocumentoAnalise[]): boolean {
  return status === 'pendencia' && docs.length > 0 && documentosComPendencia(docs).length === 0;
}

/** Mensagem de erro para o comentário de pendência; `null` se estiver válido. */
export function validarComentario(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return 'Explique o que precisa ser corrigido neste documento.';
  if (limpo.length > LIMITE_COMENTARIO) return `O comentário passa de ${LIMITE_COMENTARIO} caracteres.`;
  return null;
}

export interface GrupoDocumentos {
  titulo: string;
  documentos: DocumentoAnalise[];
}

/** "Do processo" primeiro, depois um grupo por estagiário, na ordem em que aparecem. */
export function agruparDocumentos(docs: DocumentoAnalise[]): GrupoDocumentos[] {
  const doProcesso = docs.filter((d) => !d.estagiario);
  const porEstagiario = new Map<string, DocumentoAnalise[]>();
  for (const d of docs) {
    if (d.estagiario) porEstagiario.set(d.estagiario, [...(porEstagiario.get(d.estagiario) ?? []), d]);
  }
  return [
    ...(doProcesso.length ? [{ titulo: 'Do processo', documentos: doProcesso }] : []),
    ...[...porEstagiario].map(([titulo, documentos]) => ({ titulo, documentos })),
  ];
}

/** Linha da lista "Meus processos" (visão do representante). */
export interface ResumoProcesso {
  id: string;
  numero: string;
  status: StatusProcesso;
  enviadoEm: string;
  estagiarios: number;
  totalDocumentos: number;
  analisados: number;
  pendencias: number;
}

export function resumirProcesso(p: ProcessoAnalise): ResumoProcesso {
  return {
    id: p.id,
    numero: p.numero,
    status: p.status,
    enviadoEm: p.enviadoEm,
    estagiarios: p.estagiarios,
    totalDocumentos: p.documentos.length,
    analisados: progresso(p.documentos).analisados,
    pendencias: p.status === 'pendencia' ? documentosComPendencia(p.documentos).length : 0,
  };
}

/** Devolvidos primeiro (são os que pedem ação do representante); depois o mais recente. */
export function ordenarResumos(lista: ResumoProcesso[]): ResumoProcesso[] {
  const devolvido = (r: ResumoProcesso) => (r.status === 'pendencia' ? 0 : 1);
  return [...lista].sort(
    (a, b) => devolvido(a) - devolvido(b) || b.enviadoEm.localeCompare(a.enviadoEm),
  );
}
