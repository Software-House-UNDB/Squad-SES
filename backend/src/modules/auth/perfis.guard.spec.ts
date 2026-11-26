import { Controller, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Perfil } from '../../generated/prisma/enums.js';
import { Perfis } from './perfis.decorator.js';
import { PerfisGuard } from './perfis.guard.js';

// Controller de mentira para o guard ler os metadados de verdade.
@Perfis(Perfil.COORDENACAO_SES)
@Controller()
class SoCoordenacao {
  herda() {}

  @Perfis(Perfil.REPRESENTANTE_UNDB)
  sobrescreve() {}
}

@Controller()
class SemPerfis {
  livre() {}

  @Perfis(Perfil.REPRESENTANTE_UNDB, Perfil.COORDENACAO_SES)
  dois() {}

  @Perfis(Perfil.REPRESENTANTE_UNDB)
  soRepresentante() {}
}

const guard = new PerfisGuard(new Reflector());

function contexto(
  classe: new () => object,
  metodo: string,
  usuario?: { perfil: Perfil },
): ExecutionContext {
  return {
    getHandler: () => (classe.prototype as Record<string, () => void>)[metodo],
    getClass: () => classe,
    switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
  } as unknown as ExecutionContext;
}

const COORDENACAO = { perfil: Perfil.COORDENACAO_SES };
const REPRESENTANTE = { perfil: Perfil.REPRESENTANTE_UNDB };

function erroDe(executar: () => unknown) {
  try {
    executar();
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava 403');
}

describe('PerfisGuard (RBAC, #53)', () => {
  it('rota sem @Perfis: passa qualquer perfil autenticado', () => {
    expect(guard.canActivate(contexto(SemPerfis, 'livre', COORDENACAO))).toBe(true);
    expect(guard.canActivate(contexto(SemPerfis, 'livre', REPRESENTANTE))).toBe(true);
  });

  it('perfil permitido passa', () => {
    expect(guard.canActivate(contexto(SemPerfis, 'soRepresentante', REPRESENTANTE))).toBe(true);
    expect(guard.canActivate(contexto(SemPerfis, 'dois', COORDENACAO))).toBe(true);
    expect(guard.canActivate(contexto(SemPerfis, 'dois', REPRESENTANTE))).toBe(true);
  });

  it('perfil negado: 403 com erro perfil_nao_autorizado', () => {
    const erro = erroDe(() =>
      guard.canActivate(contexto(SemPerfis, 'soRepresentante', COORDENACAO)),
    );

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect((erro as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Seu perfil não pode executar esta ação',
      erro: 'perfil_nao_autorizado',
    });
  });

  it('@Perfis no controller vale para os métodos sem @Perfis próprio', () => {
    expect(guard.canActivate(contexto(SoCoordenacao, 'herda', COORDENACAO))).toBe(true);
    expect(
      erroDe(() => guard.canActivate(contexto(SoCoordenacao, 'herda', REPRESENTANTE))),
    ).toBeInstanceOf(ForbiddenException);
  });

  it('@Perfis no método sobrescreve o do controller', () => {
    expect(guard.canActivate(contexto(SoCoordenacao, 'sobrescreve', REPRESENTANTE))).toBe(true);
    expect(
      erroDe(() => guard.canActivate(contexto(SoCoordenacao, 'sobrescreve', COORDENACAO))),
    ).toBeInstanceOf(ForbiddenException);
  });

  it('sem usuário na requisição (guard fora de ordem): nega, não libera', () => {
    expect(erroDe(() => guard.canActivate(contexto(SemPerfis, 'soRepresentante')))).toBeInstanceOf(
      ForbiddenException,
    );
  });
});
