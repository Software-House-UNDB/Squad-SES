import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { api } from './api.ts';
import {
  corpoDoEstagiario,
  enviarProcesso,
  novaRetomada,
  UploadsIncompletosError,
  type DadosEnvio,
  type ExecutarUpload,
} from './processoService.ts';
import { enviarDocumento } from './uploadService.ts';
import { ESTAGIARIO_VAZIO, PROCESSO_VAZIO, type EstagiarioForm } from '../pages/NovoProcesso/validacao.ts';

vi.mock('./uploadService.ts', async (original) => ({
  ...(await original<typeof import('./uploadService.ts')>()),
  enviarDocumento: vi.fn(),
}));
const enviarDocumentoMock = vi.mocked(enviarDocumento);

const ana: EstagiarioForm = {
  ...ESTAGIARIO_VAZIO,
  nome: ' Ana Souza ',
  cpf: '529.982.247-25',
  matricula: '2024001',
  curso: 'Enfermagem',
  email: ' ANA@Teste.com ',
  periodo: '5',
  dataInicio: '2026-12-01',
  dataTermino: '2027-06-30',
  horasPorDia: '6',
  diasSemana: ['seg', 'qua'],
  horarioInicio: '08:00',
  horarioFim: '14:00',
  cidade: 'São Luís',
  uf: 'MA',
  cep: '65000-000',
};

const pdf = (nome: string) => new File([nome], nome, { type: 'application/pdf' });

function dados(): DadosEnvio {
  return {
    processo: {
      ...PROCESSO_VAZIO,
      tipoEstagio: 'obrigatorio',
      supervisorNome: ' Maria ',
      supervisorEmail: 'Maria@Saude.ma.gov.br',
    },
    estagiarios: [ana],
    arquivos: {
      plano_atividades: pdf('plano.pdf'),
      apolice: pdf('apolice.pdf'),
      lista_indicados: pdf('lista.pdf'),
      '529.982.247-25|documento_pessoal': pdf('pessoal.pdf'),
    },
  };
}

/** Roda o envio do slot como o useUploads faz: `true` se subiu, `false` se falhou. */
const executar: ExecutarUpload = async (_chave, envio) => {
  try {
    await envio({ onProgresso: () => {}, signal: new AbortController().signal });
    return true;
  } catch {
    return false;
  }
};

describe('corpoDoEstagiario', () => {
  it('converte o formulário para o DTO: texto limpo, dígitos, números e e-mail em minúsculas', () => {
    expect(corpoDoEstagiario(ana)).toEqual({
      nome: 'Ana Souza',
      cpf: '52998224725',
      matricula: '2024001',
      curso: 'Enfermagem',
      email: 'ana@teste.com',
      menorIdade: false,
      cidade: 'São Luís',
      uf: 'MA',
      cep: '65000000',
      periodo: 5,
      dataInicio: '2026-12-01',
      dataTermino: '2027-06-30',
      horasPorDia: 6,
      diasSemana: ['seg', 'qua'],
      horarioInicio: '08:00',
      horarioFim: '14:00',
    });
  });

  it('só manda o responsável quando o estagiário é menor de idade', () => {
    const menor = corpoDoEstagiario({ ...ana, menor: true, responsavel: ' Maria Souza ' });
    expect(menor).toMatchObject({ menorIdade: true, responsavelNome: 'Maria Souza' });
    expect(corpoDoEstagiario({ ...ana, responsavel: 'sobrou' })).not.toHaveProperty('responsavelNome');
  });
});

describe('enviarProcesso', () => {
  let post: MockInstance<typeof api.post>;

  beforeEach(() => {
    enviarDocumentoMock.mockReset();
    enviarDocumentoMock.mockResolvedValue({ id: 'doc', hashSha256: 'h' });
    post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url === '/processos') return { data: { id: 'p1' } };
      if (url === '/processos/p1/estagiarios') return { data: { id: 'e1' } };
      return { data: {} };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('cria o processo e o estagiário, sobe cada PDF e só então envia à coordenação', async () => {
    await enviarProcesso(dados(), novaRetomada(), executar);

    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/processos',
      '/processos/p1/estagiarios',
      '/processos/p1/enviar',
    ]);
    expect(post.mock.calls[0][1]).toEqual({
      tipoEstagio: 'obrigatorio',
      supervisorNome: 'Maria',
      supervisorEmail: 'maria@saude.ma.gov.br',
    });

    const envios = enviarDocumentoMock.mock.calls.map(([processoId, d]) => [processoId, d.tipo, d.estagiarioId]);
    expect(envios).toEqual([
      ['p1', 'plano_atividades', undefined],
      ['p1', 'apolice', undefined],
      ['p1', 'lista_indicados', undefined],
      ['p1', 'documento_pessoal', 'e1'],
    ]);
  });

  it('se um arquivo falhar, não envia o processo e guarda o que já foi feito', async () => {
    enviarDocumentoMock.mockImplementation(async (_id, d) => {
      if (d.tipo === 'apolice') throw new Error('sem rede');
      return { id: 'doc', hashSha256: 'h' };
    });
    const retomada = novaRetomada();

    await expect(enviarProcesso(dados(), retomada, executar)).rejects.toBeInstanceOf(UploadsIncompletosError);

    expect(post.mock.calls.map(([url]) => url)).not.toContain('/processos/p1/enviar');
    expect(retomada.processoId).toBe('p1');
    expect(retomada.estagiarioIds).toEqual({ '52998224725': 'e1' });
    expect([...retomada.enviados].sort()).toEqual(
      ['529.982.247-25|documento_pessoal', 'lista_indicados', 'plano_atividades'].sort(),
    );
  });

  it('na nova tentativa não recria nada nem reenvia o que já subiu', async () => {
    enviarDocumentoMock.mockRejectedValueOnce(new Error('x')); // o 1º arquivo falha só na primeira vez
    const retomada = novaRetomada();
    await expect(enviarProcesso(dados(), retomada, executar)).rejects.toBeInstanceOf(UploadsIncompletosError);
    post.mockClear();
    enviarDocumentoMock.mockClear();

    await enviarProcesso(dados(), retomada, executar);

    expect(post.mock.calls.map(([url]) => url)).toEqual(['/processos/p1/enviar']);
    expect(enviarDocumentoMock).toHaveBeenCalledTimes(1);
    expect(enviarDocumentoMock.mock.calls[0][1].tipo).toBe('plano_atividades');
  });
});
