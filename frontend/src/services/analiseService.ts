// Análise do processo pela coordenação da SES. Ainda é SIMULADO (em memória): o backend só tem
// PATCH /processos/:id/analise (observação geral) — faltam comentário por documento, decisão por
// documento e transição de status. Troque o corpo destas funções pela API mantendo as assinaturas.
// As regras abaixo espelham o que o backend deve garantir (a tela nunca é a única barreira).
import {
  podeAprovarProcesso,
  podeDecidir,
  podeDevolverProcesso,
  validarComentario,
  type Comentario,
  type DecisaoDoc,
  type DocumentoAnalise,
  type ProcessoAnalise,
  type StatusProcesso,
} from '../pages/AnaliseProcesso/analise.ts';

export class ProcessoNaoEncontradoError extends Error {
  constructor() {
    super('processo não encontrado');
    this.name = 'ProcessoNaoEncontradoError';
  }
}

/** A API recusou a operação para o status atual (409). */
export class TransicaoInvalidaError extends Error {
  constructor(mensagem = 'operação não permitida no status atual') {
    super(mensagem);
    this.name = 'TransicaoInvalidaError';
  }
}

const AUTOR = 'Coordenação SES';
const atraso = () =>
  new Promise((resolve) => setTimeout(resolve, import.meta.env.MODE === 'test' ? 0 : 400));

function doc(
  id: string,
  rotulo: string,
  tipo: string,
  extra: Partial<DocumentoAnalise> = {},
): DocumentoAnalise {
  return {
    id,
    rotulo,
    tipo,
    nomeArquivo: `${id}.pdf`,
    tamanhoBytes: 180_000 + id.length * 17_000,
    hashSha256: Array.from(id + 'ses-undb-hash')
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
      .padEnd(64, '0')
      .slice(0, 64),
    versao: 1,
    decisao: 'pendente',
    comentarios: [],
    ...extra,
  };
}

function documentosDeExemplo(): DocumentoAnalise[] {
  return [
    doc('plano-atividades', 'Plano de atividades', 'plano_atividades'),
    doc('apolice', 'Apólice de seguro', 'apolice'),
    doc('lista-indicados', 'Lista oficial de indicados', 'lista_indicados'),
    doc('pessoais-ana', 'Documentos pessoais', 'documento_pessoal', { estagiario: 'Ana Souza' }),
    doc('pessoais-bia', 'Documentos pessoais', 'documento_pessoal', { estagiario: 'Bia Lima' }),
    doc('identidade-resp-bia', 'Identidade do responsável', 'documento_pessoal', { estagiario: 'Bia Lima' }),
    doc('declaracao-resp-bia', 'Declaração do responsável', 'declaracao', { estagiario: 'Bia Lima' }),
  ];
}

function criarBase(): Record<string, ProcessoAnalise> {
  const emAnalise = documentosDeExemplo().map((d, i): DocumentoAnalise => {
    if (i === 0 || i === 2) return { ...d, decisao: 'aprovado' };
    if (i === 1) {
      return {
        ...d,
        decisao: 'pendencia',
        comentarios: [
          {
            id: 'c-1',
            autor: AUTOR,
            tipo: 'pendencia',
            texto: 'A apólice está vencida. Envie a vigente.',
            criadoEm: '2026-11-12T14:05:00.000Z',
          },
        ],
      };
    }
    return d;
  });
  return {
    demo: {
      id: 'demo',
      numero: '2026/014',
      status: 'enviado',
      instituicao: 'UNDB',
      enviadoEm: '2026-11-10T13:20:00.000Z',
      estagiarios: 2,
      documentos: documentosDeExemplo(),
    },
    'em-analise': {
      id: 'em-analise',
      numero: '2026/012',
      status: 'em_analise',
      instituicao: 'UNDB',
      enviadoEm: '2026-11-05T09:10:00.000Z',
      estagiarios: 2,
      documentos: emAnalise,
    },
    aprovado: {
      id: 'aprovado',
      numero: '2026/009',
      status: 'aguardando_assinaturas',
      instituicao: 'UNDB',
      enviadoEm: '2026-10-30T16:45:00.000Z',
      estagiarios: 2,
      documentos: documentosDeExemplo().map((d) => ({ ...d, decisao: 'aprovado' as const })),
    },
  };
}

let base = criarBase();

/** Só para testes: volta os processos de exemplo ao estado inicial. */
export function reiniciarBaseDeExemplo() {
  base = criarBase();
}

const copia = (p: ProcessoAnalise): ProcessoAnalise => structuredClone(p);

function obter(id: string): ProcessoAnalise {
  const processo = base[id];
  if (!processo) throw new ProcessoNaoEncontradoError();
  return processo;
}

export async function buscarProcessoParaAnalise(id: string): Promise<ProcessoAnalise> {
  await atraso();
  return copia(obter(id));
}

/** enviado → em_analise. */
export async function iniciarAnalise(id: string): Promise<ProcessoAnalise> {
  await atraso();
  const processo = obter(id);
  if (processo.status !== 'enviado') throw new TransicaoInvalidaError();
  processo.status = 'em_analise';
  return copia(processo);
}

export interface DecisaoDocumento {
  decisao: Exclude<DecisaoDoc, 'pendente'>;
  /** Obrigatório quando a decisão é `pendencia` (RF-12). */
  comentario?: string;
}

export async function decidirDocumento(
  id: string,
  docId: string,
  { decisao, comentario }: DecisaoDocumento,
): Promise<ProcessoAnalise> {
  await atraso();
  const processo = obter(id);
  if (!podeDecidir(processo.status)) throw new TransicaoInvalidaError();
  const alvo = processo.documentos.find((d) => d.id === docId);
  if (!alvo) throw new TransicaoInvalidaError('documento não pertence ao processo');
  if (decisao === 'pendencia') {
    const erro = validarComentario(comentario ?? '');
    if (erro) throw new TransicaoInvalidaError(erro);
    const novo: Comentario = {
      id: `c-${Date.now()}-${alvo.comentarios.length}`,
      autor: AUTOR,
      tipo: 'pendencia',
      texto: (comentario ?? '').trim(),
      criadoEm: new Date().toISOString(),
    };
    alvo.comentarios.push(novo);
  }
  alvo.decisao = decisao;
  return copia(processo);
}

/** em_analise → aprovado (→ aguardando_assinaturas, quando o sistema gera os TCEs) ou → pendencia. */
export async function concluirAnalise(
  id: string,
  resultado: Extract<StatusProcesso, 'aprovado' | 'pendencia'>,
): Promise<ProcessoAnalise> {
  await atraso();
  const processo = obter(id);
  const permitido =
    resultado === 'aprovado'
      ? podeAprovarProcesso(processo.status, processo.documentos)
      : podeDevolverProcesso(processo.status, processo.documentos);
  if (!permitido) throw new TransicaoInvalidaError();
  processo.status = resultado === 'aprovado' ? 'aguardando_assinaturas' : 'pendencia';
  return copia(processo);
}
