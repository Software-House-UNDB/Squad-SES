import { api } from './api.ts';
import { enviarDocumento } from './uploadService.ts';
import { apenasDigitos, type EstagiarioForm, type ProcessoForm } from '../pages/NovoProcesso/validacao.ts';
import { DOCS_DO_PROCESSO, docsDoEstagiario, type SlotDoc } from '../pages/NovoProcesso/pacote.ts';

export { ArquivoRepetidoError } from './uploadService.ts';

/** Algum arquivo não subiu. O motivo de cada um aparece no próprio slot; os já enviados ficam guardados. */
export class UploadsIncompletosError extends Error {
  constructor() {
    super('nem todos os arquivos foram enviados');
    this.name = 'UploadsIncompletosError';
  }
}

/** O que já foi feito no servidor. Guardado entre tentativas para uma falha no meio não refazer nem perder nada. */
export interface RetomadaEnvio {
  processoId?: string;
  /** CPF (só dígitos) → id do estagiário já criado. */
  estagiarioIds: Record<string, string>;
  /** Chaves dos slots cujo arquivo já subiu. */
  enviados: Set<string>;
}

export const novaRetomada = (): RetomadaEnvio => ({ estagiarioIds: {}, enviados: new Set() });

type Opcoes = { onProgresso: (percentual: number) => void; signal: AbortSignal };

/** Executa um upload com progresso e cancelamento por slot; devolve `false` se ele falhou ou foi cancelado. */
export type ExecutarUpload = (chave: string, envio: (opcoes: Opcoes) => Promise<unknown>) => Promise<boolean>;

export interface DadosEnvio {
  processo: ProcessoForm;
  estagiarios: EstagiarioForm[];
  /** Arquivo escolhido em cada slot, pela chave do slot. */
  arquivos: Record<string, File>;
}

/** Corpo do POST /processos/:id/estagiarios, nos nomes e tipos do DTO do backend. */
export function corpoDoEstagiario(e: EstagiarioForm) {
  return {
    nome: e.nome.trim(),
    cpf: apenasDigitos(e.cpf),
    matricula: e.matricula.trim(),
    curso: e.curso.trim(),
    email: e.email.trim().toLowerCase(),
    menorIdade: e.menor,
    ...(e.menor ? { responsavelNome: e.responsavel.trim() } : {}),
    cidade: e.cidade.trim(),
    uf: e.uf,
    cep: apenasDigitos(e.cep),
    periodo: Number(e.periodo),
    dataInicio: e.dataInicio,
    dataTermino: e.dataTermino,
    horasPorDia: Number(e.horasPorDia),
    diasSemana: e.diasSemana,
    horarioInicio: e.horarioInicio,
    horarioFim: e.horarioFim,
  };
}

async function criarProcesso(p: ProcessoForm): Promise<string> {
  const { data } = await api.post<{ id: string }>('/processos', {
    tipoEstagio: p.tipoEstagio,
    supervisorNome: p.supervisorNome.trim(),
    supervisorEmail: p.supervisorEmail.trim().toLowerCase(),
  });
  return data.id;
}

async function criarEstagiario(processoId: string, e: EstagiarioForm): Promise<string> {
  const { data } = await api.post<{ id: string }>(`/processos/${processoId}/estagiarios`, corpoDoEstagiario(e));
  return data.id;
}

/** Slots do pacote, na ordem da tela, com o CPF do dono (se for de estagiário). */
function slotsDoPacote(estagiarios: EstagiarioForm[]): { slot: SlotDoc; cpf?: string }[] {
  return [
    ...DOCS_DO_PROCESSO.map((slot) => ({ slot })),
    ...estagiarios.flatMap((e) =>
      docsDoEstagiario(e.cpf, e.menor).map((slot) => ({ slot, cpf: apenasDigitos(e.cpf) })),
    ),
  ];
}

/**
 * Envia o processo à coordenação: cria o processo e os estagiários, sobe cada PDF (com progresso por
 * arquivo) e muda o status para "enviado". Pode ser chamado de novo depois de uma falha: só faz o que falta.
 */
export async function enviarProcesso(
  dados: DadosEnvio,
  retomada: RetomadaEnvio,
  executar: ExecutarUpload,
): Promise<void> {
  retomada.processoId ??= await criarProcesso(dados.processo);
  const processoId = retomada.processoId;

  for (const e of dados.estagiarios) {
    const cpf = apenasDigitos(e.cpf);
    retomada.estagiarioIds[cpf] ??= await criarEstagiario(processoId, e);
  }

  let todosEnviados = true;
  for (const { slot, cpf } of slotsDoPacote(dados.estagiarios)) {
    if (retomada.enviados.has(slot.chave)) continue;
    const arquivo = dados.arquivos[slot.chave];
    if (!arquivo) throw new Error(`falta o arquivo do slot ${slot.chave}`);
    const ok = await executar(slot.chave, (opcoes) =>
      enviarArquivoDoSlot(processoId, retomada, slot, arquivo, cpf, opcoes),
    );
    if (!ok) todosEnviados = false;
  }
  if (!todosEnviados) throw new UploadsIncompletosError();

  await api.post(`/processos/${processoId}/enviar`);
}

/** Sobe o arquivo de um slot e o registra como enviado; também serve para o "Tentar de novo" do slot. */
export async function enviarArquivoDoSlot(
  processoId: string,
  retomada: RetomadaEnvio,
  slot: SlotDoc,
  arquivo: File,
  cpf: string | undefined,
  opcoes: Opcoes,
) {
  const resposta = await enviarDocumento(
    processoId,
    { arquivo, tipo: slot.tipo, estagiarioId: cpf ? retomada.estagiarioIds[cpf] : undefined },
    opcoes,
  );
  retomada.enviados.add(slot.chave);
  return resposta;
}
