import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configurarApp } from '../../src/app.config.js';
import { AppModule } from '../../src/app.module.js';
import { Perfil, type StatusProcesso } from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export const SENHA = 'Senha@Integracao1';

// CPFs válidos (dígitos verificadores certos). Únicos por processo, não no banco.
export const CPFS = ['52998224725', '11144477735', '39053344705', '15350946056'];

export type Api = ReturnType<typeof criarApi>;

export async function iniciarApp() {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

// Cada arquivo de teste cria os próprios usuários, com e-mail e instituição
// únicos: os dados de execuções anteriores ficam no banco e não interferem.
export async function criarUsuarios(prisma: PrismaService) {
  const sufixo = randomUUID().slice(0, 8);
  const senhaHash = await hash(SENHA);
  const criar = (rotulo: string, perfil: Perfil, instituicao: string) =>
    prisma.usuario.create({
      data: {
        nome: `${rotulo} ${sufixo}`,
        email: `${rotulo}-${sufixo}@integracao.teste`,
        perfil,
        instituicao,
        senhaHash,
      },
    });
  return {
    coordenacao: await criar('coord', Perfil.COORDENACAO_SES, 'SES-MA'),
    // Instituições diferentes: o escopo isola os dois com ou sem o ABAC (#54).
    representante: await criar('rep', Perfil.REPRESENTANTE_UNDB, `UNDB-${sufixo}`),
    outraIes: await criar('rep-outra', Perfil.REPRESENTANTE_UNDB, `OUTRA-${sufixo}`),
  };
}

// Cliente HTTP autenticado: faz o login de verdade pela API.
export async function entrar(app: INestApplication<App>, email: string) {
  const resposta = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, senha: SENHA })
    .expect(200);
  return criarApi(app, resposta.body.accessToken as string);
}

function criarApi(app: INestApplication<App>, token: string) {
  const comToken = <T extends request.Test>(teste: T) =>
    teste.set('Authorization', `Bearer ${token}`) as T;
  const http = () => request(app.getHttpServer());
  return {
    get: (url: string) => comToken(http().get(url)),
    post: (url: string) => comToken(http().post(url)),
    patch: (url: string) => comToken(http().patch(url)),
    delete: (url: string) => comToken(http().delete(url)),
  };
}

// A máquina de estados (#55) ainda não existe: o teste põe o processo no
// status que precisa direto no banco.
export function mudarStatus(prisma: PrismaService, id: string, status: StatusProcesso) {
  return prisma.processo.update({ where: { id }, data: { status } });
}

export const estagiario = (extra: Record<string, unknown> = {}) => ({
  nome: 'Ana Souza',
  cpf: CPFS[0],
  matricula: `M-${randomUUID().slice(0, 6)}`,
  curso: 'Enfermagem',
  ...extra,
});
