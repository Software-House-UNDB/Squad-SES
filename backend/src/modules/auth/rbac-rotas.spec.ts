import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Perfil } from '../../generated/prisma/enums.js';
import { AssinaturasController } from '../assinaturas/assinaturas.controller.js';
import { AssinaturasService } from '../assinaturas/assinaturas.service.js';
import { EstagiariosController } from '../processos/estagiarios.controller.js';
import { EstagiariosService } from '../processos/estagiarios.service.js';
import { ProcessosController } from '../processos/processos.controller.js';
import { ProcessosService } from '../processos/processos.service.js';
import { TceController } from '../tce/tce.controller.js';
import { TceService } from '../tce/tce.service.js';

// RBAC (#53) pela HTTP, com o JwtAuthGuard e o PerfisGuard de verdade e os
// services falsos: cada rota restrita responde 403 ao outro perfil sem chegar
// ao service, e deixa passar o perfil certo.
const SEGREDO = 'segredo-de-teste-do-rbac-bem-longo';
const ID = '6f1c2a8e-1d3b-4c5a-9e7f-0a1b2c3d4e5f';
const { REPRESENTANTE_UNDB: REP, COORDENACAO_SES: COORD } = Perfil;

const falso = (...metodos: string[]) =>
  Object.fromEntries(metodos.map((m) => [m, vi.fn().mockResolvedValue({})]));

const servicos = {
  processos: falso(
    'criar',
    'listar',
    'buscar',
    'atualizar',
    'analisar',
    'enviar',
    'iniciarAnalise',
    'apontarPendencia',
    'aprovar',
    'remover',
  ),
  estagiarios: falso('importarLote', 'criar', 'listar', 'buscar', 'atualizar', 'remover'),
  tce: falso('gerar'),
  assinaturas: falso(
    'assinarLogado',
    'listarPorProcesso',
    'iniciarAssinaturas',
    'reenviarLinksPendentes',
    'reenviarLink',
  ),
};

type Metodo = 'get' | 'post' | 'patch' | 'delete';
type Rota = [Metodo, string, Perfil | 'ambos', keyof typeof servicos, string];

const ROTAS: Rota[] = [
  ['post', '/processos', REP, 'processos', 'criar'],
  ['get', '/processos', 'ambos', 'processos', 'listar'],
  ['get', `/processos/${ID}`, 'ambos', 'processos', 'buscar'],
  ['patch', `/processos/${ID}`, REP, 'processos', 'atualizar'],
  ['delete', `/processos/${ID}`, REP, 'processos', 'remover'],
  ['patch', `/processos/${ID}/analise`, COORD, 'processos', 'analisar'],
  ['post', `/processos/${ID}/enviar`, REP, 'processos', 'enviar'],
  ['post', `/processos/${ID}/iniciar-analise`, COORD, 'processos', 'iniciarAnalise'],
  ['post', `/processos/${ID}/pendencia`, COORD, 'processos', 'apontarPendencia'],
  ['post', `/processos/${ID}/aprovar`, COORD, 'processos', 'aprovar'],
  ['post', `/processos/${ID}/estagiarios`, REP, 'estagiarios', 'criar'],
  ['get', `/processos/${ID}/estagiarios`, 'ambos', 'estagiarios', 'listar'],
  ['get', `/processos/${ID}/estagiarios/${ID}`, 'ambos', 'estagiarios', 'buscar'],
  ['patch', `/processos/${ID}/estagiarios/${ID}`, REP, 'estagiarios', 'atualizar'],
  ['delete', `/processos/${ID}/estagiarios/${ID}`, REP, 'estagiarios', 'remover'],
  ['post', `/processos/${ID}/estagiarios/lote`, REP, 'estagiarios', 'importarLote'],
  ['post', `/processos/${ID}/tces`, COORD, 'tce', 'gerar'],
  ['post', `/assinaturas/processos/${ID}/iniciar`, COORD, 'assinaturas', 'iniciarAssinaturas'],
  ['post', `/assinaturas/signatarios/${ID}/assinar`, REP, 'assinaturas', 'assinarLogado'],
  ['get', `/assinaturas/processos/${ID}`, 'ambos', 'assinaturas', 'listarPorProcesso'],
];

let app: INestApplication;
const tokens = {} as Record<Perfil, string>;

beforeAll(async () => {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ JWT_ACCESS_SECRET: SEGREDO })] }),
      JwtModule.register({}),
    ],
    controllers: [ProcessosController, EstagiariosController, TceController, AssinaturasController],
    providers: [
      { provide: ProcessosService, useValue: servicos.processos },
      { provide: EstagiariosService, useValue: servicos.estagiarios },
      { provide: TceService, useValue: servicos.tce },
      { provide: AssinaturasService, useValue: servicos.assinaturas },
    ],
  }).compile();
  app = modulo.createNestApplication();
  await app.init();

  const jwt = app.get(JwtService);
  for (const perfil of [REP, COORD]) {
    tokens[perfil] = await jwt.signAsync(
      { sub: `usuario-${perfil}`, perfil, instituicao: perfil === REP ? 'UNDB' : 'SES-MA' },
      { secret: SEGREDO },
    );
  }
});

afterAll(() => app.close());
beforeEach(() => vi.clearAllMocks());

const chamar = (metodo: Metodo, url: string, perfil: Perfil) =>
  request(app.getHttpServer())
    [metodo](url)
    .set('Authorization', `Bearer ${tokens[perfil]}`)
    .send({});

const restritas = ROTAS.filter((rota): rota is Rota & { 2: Perfil } => rota[2] !== 'ambos');

describe('RBAC por rota (#53)', () => {
  it.each(restritas)(
    '%s %s: o outro perfil recebe 403 sem chegar ao service',
    async (metodo, url, perfil, servico, funcao) => {
      const outro = perfil === REP ? COORD : REP;

      const resposta = await chamar(metodo, url, outro);

      expect(resposta.status).toBe(403);
      expect(resposta.body).toMatchObject({ erro: 'perfil_nao_autorizado' });
      expect(servicos[servico][funcao]).not.toHaveBeenCalled();
    },
  );

  it.each(ROTAS.filter((rota) => rota[1] !== `/processos/${ID}/estagiarios/lote`))(
    '%s %s: o perfil permitido chega ao service',
    async (metodo, url, perfil, servico, funcao) => {
      const perfis = perfil === 'ambos' ? [REP, COORD] : [perfil];
      for (const quem of perfis) {
        const resposta = await chamar(metodo, url, quem);
        expect(resposta.status).toBeLessThan(300);
      }
      expect(servicos[servico][funcao]).toHaveBeenCalledTimes(perfis.length);
    },
  );

  it('lote CSV: o representante passa do guard (sem arquivo, o controller responde 400)', async () => {
    const resposta = await chamar('post', `/processos/${ID}/estagiarios/lote`, REP);
    expect(resposta.status).toBe(400);
  });

  it('sem token continua 401 (o JwtAuthGuard roda antes)', async () => {
    await request(app.getHttpServer()).post('/processos').expect(401);
  });
});
