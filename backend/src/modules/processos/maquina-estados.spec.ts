import { describe, expect, it } from 'vitest';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import { podeTransicionar, TRANSICOES, type AcaoProcesso } from './maquina-estados.js';

const TODOS = Object.values(StatusProcesso);

// O mapa esperado, escrito à mão a partir da tabela da issue #55.
const PERMITIDAS: Record<AcaoProcesso, StatusProcesso[]> = {
  enviar: [StatusProcesso.rascunho, StatusProcesso.pendencia],
  iniciar_analise: [StatusProcesso.enviado],
  apontar_pendencia: [StatusProcesso.em_analise],
  aprovar: [StatusProcesso.em_analise],
};

describe('máquina de estados do processo (RF-07)', () => {
  it.each(Object.entries(PERMITIDAS))('%s só sai de %j', (acao, permitidos) => {
    for (const status of TODOS) {
      expect(podeTransicionar(acao as AcaoProcesso, status)).toBe(permitidos.includes(status));
    }
  });

  it('leva cada ação ao status certo', () => {
    expect(TRANSICOES.enviar.para).toBe(StatusProcesso.enviado);
    expect(TRANSICOES.iniciar_analise.para).toBe(StatusProcesso.em_analise);
    expect(TRANSICOES.apontar_pendencia.para).toBe(StatusProcesso.pendencia);
    expect(TRANSICOES.aprovar.para).toBe(StatusProcesso.aprovado);
  });

  it('dá cada ação a um único perfil', () => {
    expect(TRANSICOES.enviar.perfil).toBe(Perfil.REPRESENTANTE_UNDB);
    expect(TRANSICOES.iniciar_analise.perfil).toBe(Perfil.COORDENACAO_SES);
    expect(TRANSICOES.apontar_pendencia.perfil).toBe(Perfil.COORDENACAO_SES);
    expect(TRANSICOES.aprovar.perfil).toBe(Perfil.COORDENACAO_SES);
  });

  it('não leva a aguardando_assinaturas nem a concluido (módulo de assinaturas)', () => {
    const destinos = Object.values(TRANSICOES).map((t) => t.para);
    expect(destinos).not.toContain(StatusProcesso.aguardando_assinaturas);
    expect(destinos).not.toContain(StatusProcesso.concluido);
  });

  it('não sai de aprovado, aguardando_assinaturas nem concluido', () => {
    for (const status of [
      StatusProcesso.aprovado,
      StatusProcesso.aguardando_assinaturas,
      StatusProcesso.concluido,
    ]) {
      for (const acao of Object.keys(TRANSICOES) as AcaoProcesso[]) {
        expect(podeTransicionar(acao, status)).toBe(false);
      }
    }
  });
});
