// Regras do pacote de documentos de um processo (RF-08, RF-09, RF-10 e RF-13 do projeto piloto).
//
// O TCE não entra aqui de propósito: ele é gerado pelo sistema a partir do modelo da SES
// (Portaria 1327), nunca anexado pelo representante.

export const LIMITE_MB = 20;
export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function formatarTamanho(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export interface SlotDoc {
  chave: string;
  rotulo: string;
}

/** Documentos que valem para o processo inteiro. */
export const DOCS_DO_PROCESSO: SlotDoc[] = [
  { chave: 'plano', rotulo: 'Plano de atividades' },
  { chave: 'apolice', rotulo: 'Apólice de seguro' },
  { chave: 'lista', rotulo: 'Lista oficial de indicados' },
];

/** Documentos de cada estagiário; menores de idade levam identidade e declaração do responsável. */
export function docsDoEstagiario(cpf: string, menor: boolean): SlotDoc[] {
  const docs: SlotDoc[] = [{ chave: `${cpf}|pessoais`, rotulo: 'Documentos pessoais' }];
  if (menor) {
    docs.push(
      { chave: `${cpf}|identidade_responsavel`, rotulo: 'Identidade do responsável' },
      { chave: `${cpf}|declaracao_responsavel`, rotulo: 'Declaração do responsável' },
    );
  }
  return docs;
}

/** Mensagem de erro se o arquivo não puder ser anexado; `null` se estiver tudo certo. */
export function validarArquivo(arquivo: { size: number; type: string }): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return 'Formato não aceito. Use PDF, JPG ou PNG.';
  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return `O arquivo tem ${mb} MB. O limite é ${LIMITE_MB} MB.`;
  }
  return null;
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
