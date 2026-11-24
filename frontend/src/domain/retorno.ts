import type { Perfil } from '../types/auth.ts';
import type { StatusProcesso } from './processo.ts';

// Regras dos documentos de retorno da coordenação SES (ofício carimbado, kit de estágio...).
// Espelham a API (#48): a tela só esconde o que a API recusaria; quem garante é o backend.

export type TipoRetorno = 'oficio' | 'oficio_alteracao' | 'kit_estagio' | 'anexo';

/** Os únicos tipos que a coordenação pode enviar (o TCE e o pacote ficam com o representante). */
export const TIPOS_RETORNO: { tipo: TipoRetorno; rotulo: string }[] = [
  { tipo: 'oficio', rotulo: 'Ofício' },
  { tipo: 'oficio_alteracao', rotulo: 'Ofício de alteração' },
  { tipo: 'kit_estagio', rotulo: 'Kit de estágio' },
  { tipo: 'anexo', rotulo: 'Anexo' },
];

/** Status em que a coordenação envia/remove retorno. `concluido` fica fechado. */
export const STATUS_RETORNO: readonly StatusProcesso[] = ['aprovado', 'aguardando_assinaturas'];

/** Status em que o representante envia/remove documentos do pacote. */
const STATUS_PACOTE_UNDB: readonly StatusProcesso[] = ['rascunho', 'pendencia'];

export type LadoDocumento = 'UNDB' | 'SES';

export function podeEnviarRetorno(perfil: Perfil, status: StatusProcesso): boolean {
  return perfil === 'COORDENACAO_SES' && STATUS_RETORNO.includes(status);
}

/**
 * Só o criador do processo envia documentos do lado da UNDB; todo o resto é retorno da SES.
 * Compara com `criadoPorId` (e não com o usuário logado) porque a remoção é por lado, não por pessoa.
 */
export function ladoDoDocumento(
  doc: { enviadoPorId: string },
  processo: { criadoPorId: string },
): LadoDocumento {
  return doc.enviadoPorId === processo.criadoPorId ? 'UNDB' : 'SES';
}

/** Mostrar o botão de excluir? Cada lado remove só o que é do seu lado, e só nos status do seu lado. */
export function podeExcluirDocumento(dados: {
  perfil: Perfil;
  status: StatusProcesso;
  doc: { enviadoPorId: string };
  processo: { criadoPorId: string };
}): boolean {
  const lado = ladoDoDocumento(dados.doc, dados.processo);
  if (dados.perfil === 'COORDENACAO_SES') {
    return lado === 'SES' && STATUS_RETORNO.includes(dados.status);
  }
  return lado === 'UNDB' && STATUS_PACOTE_UNDB.includes(dados.status);
}
