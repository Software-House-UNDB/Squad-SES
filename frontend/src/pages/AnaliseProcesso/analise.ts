// Regras da análise documento a documento feita pela coordenação da SES (RF-07, RF-08, RF-12).
// Funções puras: a tela só pergunta "posso?"; a máquina de estados de verdade fica no backend.

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
