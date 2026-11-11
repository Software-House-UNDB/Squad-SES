// Regras do pacote de documentos de um processo (RF-08, RF-09, RF-10 e RF-13 do projeto piloto).
//
// O TCE não entra aqui de propósito: ele é gerado pelo sistema a partir do modelo da SES
// (Portaria 1327), nunca anexado pelo representante.

export const LIMITE_MB = 20;
// Por regra do MVP o backend só aceita PDF (conferido pela assinatura do arquivo).
export const TIPOS_ACEITOS = ['application/pdf'];
export const ACCEPT = '.pdf,application/pdf';

export function formatarTamanho(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Tipos de documento da API (RF-09). Os slots da tela são traduzidos para estes nomes aqui. */
export type TipoDocumento =
  | 'plano_atividades'
  | 'apolice'
  | 'lista_indicados'
  | 'documento_pessoal'
  | 'declaracao';

export interface SlotDoc {
  /** Identifica o slot na tela (único no processo; os do estagiário levam o CPF). */
  chave: string;
  rotulo: string;
  /** Tipo enviado à API para o arquivo deste slot. */
  tipo: TipoDocumento;
}

/** Documentos que valem para o processo inteiro. */
export const DOCS_DO_PROCESSO: SlotDoc[] = [
  { chave: 'plano_atividades', rotulo: 'Plano de atividades', tipo: 'plano_atividades' },
  { chave: 'apolice', rotulo: 'Apólice de seguro', tipo: 'apolice' },
  { chave: 'lista_indicados', rotulo: 'Lista oficial de indicados', tipo: 'lista_indicados' },
];

/** Documentos de cada estagiário; menores de idade levam identidade e declaração do responsável. */
export function docsDoEstagiario(cpf: string, menor: boolean): SlotDoc[] {
  const docs: SlotDoc[] = [{ chave: `${cpf}|documento_pessoal`, rotulo: 'Documentos pessoais', tipo: 'documento_pessoal' }];
  if (menor) {
    docs.push(
      {
        chave: `${cpf}|identidade_responsavel`,
        rotulo: 'Identidade do responsável',
        tipo: 'documento_pessoal',
      },
      {
        chave: `${cpf}|declaracao_responsavel`,
        rotulo: 'Declaração do responsável',
        tipo: 'declaracao',
      },
    );
  }
  return docs;
}

/** Mensagem de erro se o arquivo não puder ser anexado; `null` se estiver tudo certo. */
export function validarArquivo(arquivo: { size: number; type: string }): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return 'Formato não aceito. Envie o arquivo em PDF.';
  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return `O arquivo tem ${mb} MB. O limite é ${LIMITE_MB} MB.`;
  }
  return null;
}

/** Mensagem quando o mesmo arquivo já está em outro slot do processo (o backend responde 409). */
export const MSG_ARQUIVO_REPETIDO =
  'Este arquivo já foi anexado em outro documento deste processo. Anexe um arquivo diferente para cada documento.';

/** SHA-256 do conteúdo, igual ao que o backend usa para detectar repetidos. `null` se o navegador não suportar. */
export async function hashDoArquivo(arquivo: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result as ArrayBuffer);
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsArrayBuffer(arquivo);
    });
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

interface EstagiarioDoPacote {
  nome: string;
  cpf: string;
  menor: boolean;
}

/** Todos os documentos obrigatórios do pacote, na ordem em que aparecem na tela. */
export function exigidos(estagiarios: EstagiarioDoPacote[]): { chave: string; descricao: string }[] {
  return [
    ...DOCS_DO_PROCESSO.map((d) => ({ chave: d.chave, descricao: d.rotulo })),
    ...estagiarios.flatMap((e) =>
      docsDoEstagiario(e.cpf, e.menor).map((d) => ({
        chave: d.chave,
        descricao: `${e.nome}: ${d.rotulo.toLowerCase()}`,
      })),
    ),
  ];
}

/** O que ainda impede o envio. Lista vazia = pacote completo (RF-08: incompleto não avança). */
export function pendenciasDoPacote(
  estagiarios: EstagiarioDoPacote[],
  anexados: Set<string>,
): string[] {
  const faltando = exigidos(estagiarios)
    .filter((d) => !anexados.has(d.chave))
    .map((d) => d.descricao);
  return estagiarios.length === 0 ? ['Adicione ao menos um estagiário.', ...faltando] : faltando;
}
