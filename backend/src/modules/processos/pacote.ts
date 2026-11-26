import { TipoDocumento } from '../../generated/prisma/enums.js';

// Barramento do pacote incompleto (RF-08), conferido no "enviar".
// Espelha frontend/src/pages/NovoProcesso/pacote.ts (DOCS_DO_PROCESSO +
// docsDoEstagiario): se uma regra mudar, mude nos dois lugares.
// O TCE fica fora: ele é gerado pelo sistema (RF-10), não anexado.

// Um de cada, valendo para o processo inteiro.
export const DOCS_DO_PROCESSO: { tipo: TipoDocumento; rotulo: string }[] = [
  { tipo: TipoDocumento.plano_atividades, rotulo: 'plano de atividades' },
  { tipo: TipoDocumento.apolice, rotulo: 'apólice de seguro' },
  { tipo: TipoDocumento.lista_indicados, rotulo: 'lista oficial de indicados' },
];

export type EstagiarioDoPacote = { id: string; nome: string; menorIdade: boolean };
export type DocumentoDoPacote = { tipo: TipoDocumento; estagiarioId: string | null };
export type PendenciaPacote = { campo: string; motivo: string; estagiarioId?: string };

export function pendenciasPacote(
  estagiarios: EstagiarioDoPacote[],
  documentos: DocumentoDoPacote[],
): PendenciaPacote[] {
  const pendencias: PendenciaPacote[] = [];
  if (estagiarios.length === 0) {
    pendencias.push({ campo: 'estagiarios', motivo: 'processo sem estagiários' });
  }

  for (const { tipo, rotulo } of DOCS_DO_PROCESSO) {
    if (!documentos.some((d) => d.tipo === tipo)) {
      pendencias.push({ campo: tipo, motivo: `${rotulo} não anexado(a)` });
    }
  }

  for (const estagiario of estagiarios) {
    const doEstagiario = (tipo: TipoDocumento) =>
      documentos.filter((d) => d.estagiarioId === estagiario.id && d.tipo === tipo).length;
    const faltando = (campo: string, motivo: string) =>
      pendencias.push({
        campo,
        motivo: `${estagiario.nome}: ${motivo}`,
        estagiarioId: estagiario.id,
      });

    // Na tela, a identidade do responsável é um segundo documento_pessoal (RF-13).
    const pessoais = doEstagiario(TipoDocumento.documento_pessoal);
    if (pessoais === 0) faltando('documento_pessoal', 'documentos pessoais não anexados');
    if (estagiario.menorIdade) {
      if (pessoais < 2) {
        faltando('identidade_responsavel', 'identidade do responsável não anexada');
      }
      if (doEstagiario(TipoDocumento.declaracao) === 0) {
        faltando('declaracao', 'declaração do responsável não anexada');
      }
    }
  }
  return pendencias;
}
