// Análise do processo pela coordenação da SES e correção pelo representante da UNDB. Ainda é
// SIMULADO (em memória): o backend só tem PATCH /processos/:id/analise (observação geral) — faltam
// comentário por documento, decisão por documento, nova versão de documento e transição de status.
// Troque o corpo destas funções pela API mantendo as assinaturas.
// As regras abaixo espelham o que o backend deve garantir (a tela nunca é a única barreira).
import {
  ordenarResumos,
  podeAprovarProcesso,
  podeDecidir,
  podeDevolverProcesso,
  podeReenviar,
  podeSubstituir,
  resumirProcesso,
  validarComentario,
  type Comentario,
  type DecisaoDoc,
  type DocumentoAnalise,
  type ProcessoAnalise,
  type ResumoProcesso,
} from '../pages/AnaliseProcesso/analise.ts';
import type { StatusProcesso } from '../domain/processo.ts';
import { ArquivoRepetidoError } from './processoService.ts';

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

/** Hex de 64 caracteres derivado do texto: só para o exemplo parecer um SHA-256. */
function hashSimulado(texto: string): string {
  return Array.from(texto)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0')
    .slice(0, 64);
}

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
    hashSha256: hashSimulado(id + 'ses-undb-hash'),
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
  const devolvido = documentosDeExemplo().map((d): DocumentoAnalise => {
    const pendencia = (texto: string): DocumentoAnalise => ({
      ...d,
      decisao: 'pendencia',
      comentarios: [
        { id: `c-${d.id}`, autor: AUTOR, tipo: 'pendencia', texto, criadoEm: '2026-11-14T10:30:00.000Z' },
      ],
    });
    if (d.id === 'apolice') return pendencia('A apólice está vencida. Envie a vigente.');
    if (d.id === 'declaracao-resp-bia') return pendencia('Falta a assinatura do responsável na declaração.');
    return { ...d, decisao: 'aprovado' };
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
    devolvido: {
      id: 'devolvido',
      numero: '2026/011',
      status: 'pendencia',
      instituicao: 'UNDB',
      enviadoEm: '2026-11-03T11:00:00.000Z',
      estagiarios: 2,
      documentos: devolvido,
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
  // O id vem da URL. `base` é um objeto comum: sem hasOwn, ids como "__proto__" ou "constructor"
  // achariam propriedades herdadas (um objeto vazio, uma função) em vez de "não encontrado".
  if (!Object.hasOwn(base, id)) throw new ProcessoNaoEncontradoError();
  return base[id];
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

/**
 * em_analise → aprovado ou → pendencia.
 * `aprovado` é um estado persistido: nele o sistema gera os TCEs e só então o processo vira
 * aguardando_assinaturas. Esse segundo passo é do backend, não desta tela.
 */
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
  processo.status = resultado;
  return copia(processo);
}

/** Visão do representante: os processos da instituição, com os devolvidos primeiro. */
export async function listarMeusProcessos(): Promise<ResumoProcesso[]> {
  await atraso();
  return ordenarResumos(Object.values(base).map(resumirProcesso));
}

export interface ArquivoNovo {
  nomeArquivo: string;
  tamanhoBytes: number;
  /** SHA-256 calculado no navegador; sem ele (navegador sem SubtleCrypto) o servidor calcula o seu. */
  hashSha256?: string;
}

/**
 * Troca o arquivo de um documento em pendência por uma nova versão (RF-11). O documento volta a
 * "não analisado"; os já aprovados continuam aprovados e o histórico de comentários é preservado.
 */
export async function substituirDocumento(
  id: string,
  docId: string,
  { nomeArquivo, tamanhoBytes, hashSha256 }: ArquivoNovo,
): Promise<ProcessoAnalise> {
  await atraso();
  const processo = obter(id);
  const alvo = processo.documentos.find((d) => d.id === docId);
  if (!alvo) throw new TransicaoInvalidaError('documento não pertence ao processo');
  if (!podeSubstituir(processo.status, alvo)) throw new TransicaoInvalidaError();
  // A API rejeitaria com 400; a tela já barra, mas o serviço não pode confiar em quem o chama.
  if (nomeArquivo.trim() === '') throw new TransicaoInvalidaError('arquivo sem nome');
  if (!Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0) throw new TransicaoInvalidaError('arquivo vazio ou com tamanho inválido');
  const versao = alvo.versao + 1;
  // Hex é minúsculo; "AB…" e "ab…" são o mesmo conteúdo.
  const hash = (hashSha256 ?? hashSimulado(`${docId}-v${versao}-${nomeArquivo}-${tamanhoBytes}`)).toLowerCase();
  // Como a API (409): o mesmo conteúdo não entra duas vezes no processo, nem no lugar do próprio documento.
  if (processo.documentos.some((d) => d.hashSha256 === hash)) throw new ArquivoRepetidoError();
  Object.assign(alvo, { nomeArquivo, tamanhoBytes, hashSha256: hash, versao, decisao: 'pendente' });
  return copia(processo);
}

/** pendencia → enviado: a coordenação volta a analisar (RF-07). */
export async function reenviarProcesso(id: string): Promise<ProcessoAnalise> {
  await atraso();
  const processo = obter(id);
  if (!podeReenviar(processo.status, processo.documentos)) throw new TransicaoInvalidaError();
  processo.status = 'enviado';
  return copia(processo);
}
