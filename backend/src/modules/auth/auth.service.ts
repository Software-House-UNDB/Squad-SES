import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { TokenPayload, Tokens } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshDto } from './dto/refresh.dto.js';

type Validade = JwtSignOptions['expiresIn'];

const SESSAO_EXPIRADA = 'Sessão expirada, faça login novamente';

// Origem da tentativa de login, para a trilha de auditoria (RF-23).
export type OrigemLogin = { ip?: string; userAgent?: string };

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessValidade: Validade;
  private readonly refreshValidade: Validade;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {
    // getOrThrow: sem os segredos o servidor nem sobe, em vez de falhar só no primeiro login.
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessValidade = config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as Validade;
    this.refreshValidade = config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as Validade;
  }

  async login(dto: LoginDto, origem: OrigemLogin = {}) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });

    // Mesma resposta para e-mail inexistente e senha errada: não revela quais e-mails têm conta.
    // O motivo real fica só na auditoria, que nenhum cliente da API lê.
    if (!usuario || !(await verify(usuario.senhaHash, dto.senha))) {
      await this.auditoria.registrarAcesso(
        { ip: origem.ip },
        {
          acao: 'LOGIN_FALHA',
          entidade: 'usuario',
          // E-mail sem conta não tem id: fica o e-mail tentado, para achar força bruta.
          entidadeId: usuario?.id ?? dto.email,
          dadosDepois: {
            email: dto.email,
            motivo: usuario ? 'senha_incorreta' : 'usuario_inexistente',
            userAgent: origem.userAgent,
          },
        },
      );
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    await this.auditoria.registrarAcesso(
      { id: usuario.id, ip: origem.ip },
      {
        acao: 'LOGIN',
        entidade: 'usuario',
        entidadeId: usuario.id,
        dadosDepois: { userAgent: origem.userAgent },
      },
    );

    const tokens = await this.gerarTokens({
      sub: usuario.id,
      perfil: usuario.perfil,
      instituicao: usuario.instituicao,
    });
    return {
      ...tokens,
      // Nunca devolver o senhaHash: só os campos que o frontend usa.
      usuario: {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.perfil,
        instituicao: usuario.instituicao,
      },
    };
  }

  async refresh(dto: RefreshDto): Promise<Tokens> {
    const payload = await this.jwt
      .verifyAsync<TokenPayload>(dto.refreshToken, { secret: this.refreshSecret })
      .catch(() => {
        throw new UnauthorizedException(SESSAO_EXPIRADA);
      });

    // Relê o usuário: se ele foi removido ou mudou de perfil, isso já vale no token novo.
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, perfil: true, instituicao: true },
    });
    if (!usuario) throw new UnauthorizedException(SESSAO_EXPIRADA);

    return this.gerarTokens({
      sub: usuario.id,
      perfil: usuario.perfil,
      instituicao: usuario.instituicao,
    });
  }

  // Os dois tokens levam o mesmo conteúdo, mas são assinados com segredos diferentes:
  // um refresh token não serve para acessar rotas, e um access token não serve para renovar.
  private async gerarTokens(payload: TokenPayload): Promise<Tokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { secret: this.accessSecret, expiresIn: this.accessValidade }),
      this.jwt.signAsync(payload, { secret: this.refreshSecret, expiresIn: this.refreshValidade }),
    ]);
    return { accessToken, refreshToken };
  }
}
