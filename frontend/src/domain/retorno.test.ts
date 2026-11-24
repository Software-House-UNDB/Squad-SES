import { describe, expect, it } from 'vitest';
import { STATUS_PROCESSO, type StatusProcesso } from './processo.ts';
import {
  TIPOS_RETORNO,
  ladoDoDocumento,
  podeEnviarRetorno,
  podeExcluirDocumento,
} from './retorno.ts';

const processo = { criadoPorId: 'rep-1' };
const docUndb = { enviadoPorId: 'rep-1' };
const docSes = { enviadoPorId: 'coord-1' };
const docSesOutroUsuario = { enviadoPorId: 'coord-2' };

describe('documentos de retorno da coordenação (#50)', () => {
  it('oferece só os 4 tipos que a API aceita da coordenação', () => {
    expect(TIPOS_RETORNO.map((t) => t.tipo)).toEqual([
      'oficio',
      'oficio_alteracao',
      'kit_estagio',
      'anexo',
    ]);
    expect(TIPOS_RETORNO.every((t) => t.rotulo.length > 0)).toBe(true);
  });

  describe('podeEnviarRetorno', () => {
    it.each<StatusProcesso>(['aprovado', 'aguardando_assinaturas'])(
      'coordenação envia em %s',
      (status) => expect(podeEnviarRetorno('COORDENACAO_SES', status)).toBe(true),
    );

    it.each(STATUS_PROCESSO.filter((s) => s !== 'aprovado' && s !== 'aguardando_assinaturas'))(
      'coordenação não envia em %s',
      (status) => expect(podeEnviarRetorno('COORDENACAO_SES', status)).toBe(false),
    );

    it.each(STATUS_PROCESSO)('representante nunca envia retorno (%s)', (status) =>
      expect(podeEnviarRetorno('REPRESENTANTE_UNDB', status)).toBe(false),
    );
  });

  describe('ladoDoDocumento', () => {
    it('documento do criador do processo é da UNDB; qualquer outro é retorno da SES', () => {
      expect(ladoDoDocumento(docUndb, processo)).toBe('UNDB');
      expect(ladoDoDocumento(docSes, processo)).toBe('SES');
      expect(ladoDoDocumento(docSesOutroUsuario, processo)).toBe('SES');
    });
  });

  describe('podeExcluirDocumento', () => {
    const pode = (
      perfil: 'COORDENACAO_SES' | 'REPRESENTANTE_UNDB',
      status: StatusProcesso,
      doc: { enviadoPorId: string },
    ) => podeExcluirDocumento({ perfil, status, doc, processo });

    it('coordenação remove qualquer retorno da SES, inclusive de outro colega, nos status de retorno', () => {
      expect(pode('COORDENACAO_SES', 'aprovado', docSes)).toBe(true);
      expect(pode('COORDENACAO_SES', 'aguardando_assinaturas', docSesOutroUsuario)).toBe(true);
    });

    it('coordenação não remove o pacote da UNDB', () => {
      expect(pode('COORDENACAO_SES', 'aprovado', docUndb)).toBe(false);
    });

    it('coordenação não remove retorno fora dos status de retorno (a API devolveria 409)', () => {
      expect(pode('COORDENACAO_SES', 'concluido', docSes)).toBe(false);
      expect(pode('COORDENACAO_SES', 'em_analise', docSes)).toBe(false);
    });

    it('representante remove o pacote da UNDB em rascunho e pendência', () => {
      expect(pode('REPRESENTANTE_UNDB', 'rascunho', docUndb)).toBe(true);
      expect(pode('REPRESENTANTE_UNDB', 'pendencia', docUndb)).toBe(true);
    });

    it('representante não remove retorno da SES nem mexe fora de rascunho/pendência', () => {
      expect(pode('REPRESENTANTE_UNDB', 'pendencia', docSes)).toBe(false);
      expect(pode('REPRESENTANTE_UNDB', 'enviado', docUndb)).toBe(false);
      expect(pode('REPRESENTANTE_UNDB', 'aprovado', docUndb)).toBe(false);
    });
  });
});
