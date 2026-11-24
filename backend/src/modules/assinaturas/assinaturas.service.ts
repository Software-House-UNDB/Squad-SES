import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  MetodoAssinatura,
  PapelSignatario,
  Perfil,
  StatusProcesso,
  TipoDocumento,
} from '../../generated/prisma/enums.js';
import { EmailService } from '../../email/email.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { calcularSha256 } from '../documentos/arquivo.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { escopoProcesso } from '../auth/escopo-processo.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { formatarCodigo, gerarCodigoValidacao } from './codigo-validacao.js';
import { emailCodigoOtp, emailLinkAssinatura } from './emails.js';
import { FORMATO_TOKEN, gerarOtp, gerarToken, hashToken, mascararEmail } from './tokens.js';

export const LINK_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
export const OTP_VALIDADE_MS = 10 * 60 * 1000;
// Intervalo mínimo entre dois pedidos de código para o mesmo link.
export const OTP_INTERVALO_MS = 60 * 1000;
export const OTP_MAX_TENTATIVAS = 5;

type Pendencia = { campo: string; motivo: string; documentoId?: string; estagiarioId?: string };

type DadosSignatario = {
  papel: PapelSignatario;
  nome: string;
  email: string;
  usuarioId?: string;
  estagiarioId?: string;
};

type SignatarioParaLink = { id: string; nome: string; email: string; papel: PapelSignatario };

const INCLUIR_NO_LINK = {
  assinatura: { select: { id: true } },
  documento: {
    select: {
      id: true,
      tipo: true,
      nomeArquivo: true,
      codigoValidacao: true,
      mimeType: true,
      storageKey: true,
      hashSha256: true,
      processo: { select: { id: true, status: true } },
    },
  },
} satisfies Prisma.SignatarioInclude;

type SignatarioDoLink = Prisma.SignatarioGetPayload<{ include: typeof INCLUIR_NO_LINK }>;

// O que a requisição de assinatura traz como evidência (RF-15).
export type EvidenciaRequisicao = { ip?: string; userAgent?: string };

const VALIDADE_URL_DOCUMENTO_SEGUNDOS = 5 * 60;

const muitasTentativas = (corpo: object) => new HttpException(corpo, HttpStatus.TOO_MANY_REQUESTS);

@Injectable()
export class AssinaturasService {
  private readonly logger = new Logger(AssinaturasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  // Chamado na transição aprovado -> aguardando_assinaturas, dentro da mesma
  // transação e depois de o status mudar. Cria os 4 signatários de cada TCE
  // do processo. Não envia e-mail: quem chamou roda enviarLinks() depois do
  // commit, para não mandar link de uma transação desfeita.
  // Idempotente: papéis que já existem no documento são pulados.
  async criarSignatarios(
    tx: Prisma.TransactionClient,
    processoId: string,
    usuario: Pick<UsuarioAutenticado, 'ip'> & { id?: string },
  ) {
    const processo = await tx.processo.findUnique({
      where: { id: processoId },
      include: {
        criadoPor: { select: { id: true, nome: true, email: true } },
        documentos: {
          where: { tipo: TipoDocumento.termo_compromisso },
          include: {
            estagiario: { select: { id: true, nome: true, email: true } },
            signatarios: { select: { papel: true } },
          },
        },
      },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    if (processo.status !== StatusProcesso.aguardando_assinaturas) {
      throw new ConflictException(`Processo em ${processo.status} não está aguardando assinaturas`);
    }
    const diretor = this.diretorEsp();

    const pendencias: Pendencia[] = [];
    if (processo.documentos.length === 0) {
      pendencias.push({ campo: 'tce', motivo: 'nenhum TCE enviado no processo' });
    }
    if (!processo.supervisorNome) {
      pendencias.push({ campo: 'supervisorNome', motivo: 'nome do supervisor não informado' });
    }
    if (!processo.supervisorEmail) {
      pendencias.push({ campo: 'supervisorEmail', motivo: 'e-mail do supervisor não informado' });
    }
    for (const documento of processo.documentos) {
      if (!documento.estagiario) {
        pendencias.push({
          campo: 'estagiarioId',
          motivo: 'TCE sem estagiário vinculado',
          documentoId: documento.id,
        });
      } else if (!documento.estagiario.email) {
        pendencias.push({
          campo: 'email',
          motivo: 'e-mail do estagiário não informado',
          estagiarioId: documento.estagiario.id,
        });
      }
    }
    if (pendencias.length > 0) {
      throw new BadRequestException({ erro: 'assinatura_incompleta', pendencias });
    }

    const criados = [];
    for (const documento of processo.documentos) {
      const estagiario = documento.estagiario!;
      const todos: DadosSignatario[] = [
        {
          papel: PapelSignatario.REPRESENTANTE_UNDB,
          nome: processo.criadoPor.nome,
          email: processo.criadoPor.email,
          usuarioId: processo.criadoPor.id,
        },
        {
          papel: PapelSignatario.SUPERVISOR,
          nome: processo.supervisorNome!,
          email: processo.supervisorEmail!,
        },
        { papel: PapelSignatario.DIRETOR_ESP, ...diretor },
        {
          papel: PapelSignatario.ESTAGIARIO,
          nome: estagiario.nome,
          email: estagiario.email!,
          estagiarioId: estagiario.id,
        },
      ];
      const existentes = new Set(documento.signatarios.map(({ papel }) => papel));

      // Código público de validação (RF-17): nasce junto com os signatários.
      if (!documento.codigoValidacao) {
        await tx.documento.update({
          where: { id: documento.id },
          data: { codigoValidacao: gerarCodigoValidacao() },
        });
      }

      for (const dados of todos.filter(({ papel }) => !existentes.has(papel))) {
        const signatario = await tx.signatario.create({
          data: { ...dados, documentoId: documento.id },
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'CREATE',
          entidade: 'signatario',
          entidadeId: signatario.id,
          dadosDepois: { documentoId: documento.id, ...dados },
        });
        criados.push(signatario);
      }
    }
    return criados;
  }

  // Transição aprovado -> aguardando_assinaturas (#68). Hoje a coordenação
  // dispara pela rota provisória; quando a máquina de estados (#55) entrar,
  // ela chama este método nessa transição. O status, a auditoria e os
  // signatários vão numa transação só: se faltar algo (assinatura_incompleta),
  // o processo continua aprovado. Os links saem depois do commit; quem não
  // recebeu entra de novo em reenviarLinksPendentes().
  async iniciarAssinaturas(processoId: string, usuario: UsuarioAutenticado) {
    if (usuario.perfil !== Perfil.COORDENACAO_SES) {
      throw new ForbiddenException('Apenas a coordenação SES inicia as assinaturas');
    }
    const criados = await this.prisma.$transaction(async (tx) => {
      // A condição de status vai no próprio UPDATE: dois pedidos simultâneos
      // não iniciam o mesmo processo duas vezes.
      const { count } = await tx.processo.updateMany({
        where: { id: processoId, status: StatusProcesso.aprovado },
        data: { status: StatusProcesso.aguardando_assinaturas },
      });
      if (count === 0) {
        const processo = await tx.processo.findUnique({
          where: { id: processoId },
          select: { status: true },
        });
        if (!processo) throw new NotFoundException('Processo não encontrado');
        throw new ConflictException({
          erro: 'transicao_invalida',
          motivo: `Processo em ${processo.status} não pode iniciar as assinaturas, só a partir de aprovado`,
        });
      }
      await this.auditoria.registrar(tx, usuario, {
        acao: 'UPDATE',
        entidade: 'processo',
        entidadeId: processoId,
        dadosAntes: { status: StatusProcesso.aprovado },
        dadosDepois: { status: StatusProcesso.aguardando_assinaturas },
      });
      return this.criarSignatarios(tx, processoId, usuario);
    });

    const envio = await this.enviarLinks(processoId);
    return {
      processoId,
      status: StatusProcesso.aguardando_assinaturas,
      signatariosCriados: criados.length,
      ...envio,
    };
  }

  // Reenvio dos links que não saíram (falha de e-mail em iniciarAssinaturas).
  // Manda só a quem ainda não recebeu: quem já tem link usa reenviarLink().
  async reenviarLinksPendentes(processoId: string, usuario: UsuarioAutenticado) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, ...this.escopo(usuario) },
      select: { status: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    if (processo.status !== StatusProcesso.aguardando_assinaturas) {
      throw new ConflictException(`Processo em ${processo.status} não está aguardando assinaturas`);
    }
    return this.enviarLinks(processoId);
  }

  // Depois do commit de criarSignatarios(). Manda o link a quem ainda não
  // recebeu. O representante da UNDB assina logado e não recebe link.
  // Uma falha de envio não impede os outros; quem falhou fica sem
  // linkEnviadoEm e entra de novo na próxima chamada (ou no reenvio).
  async enviarLinks(processoId: string) {
    const pendentes = await this.prisma.signatario.findMany({
      where: {
        documento: { processoId },
        papel: { not: PapelSignatario.REPRESENTANTE_UNDB },
        linkEnviadoEm: null,
        assinatura: { is: null },
      },
      select: { id: true, nome: true, email: true, papel: true },
    });

    let enviados = 0;
    const falhas: { signatarioId: string; papel: PapelSignatario }[] = [];
    for (const signatario of pendentes) {
      try {
        await this.emitirLink(signatario);
        enviados++;
      } catch (erro) {
        this.logger.error(
          `Falha ao enviar o link ao signatário ${signatario.id}`,
          erro instanceof Error ? erro.stack : String(erro),
        );
        falhas.push({ signatarioId: signatario.id, papel: signatario.papel });
      }
    }
    return { enviados, falhas };
  }

  // Gera um link novo (o anterior deixa de valer) e zera o código pendente.
  async reenviarLink(id: string, usuario: UsuarioAutenticado) {
    const signatario = await this.prisma.signatario.findFirst({
      where: { id, documento: { processo: this.escopo(usuario) } },
      include: INCLUIR_NO_LINK,
    });
    if (!signatario) throw new NotFoundException('Signatário não encontrado');
    if (signatario.papel === PapelSignatario.REPRESENTANTE_UNDB) {
      throw new ConflictException('O representante da UNDB assina logado, sem link');
    }
    if (signatario.assinatura) throw new ConflictException('O signatário já assinou');
    const { status } = signatario.documento.processo;
    if (status !== StatusProcesso.aguardando_assinaturas) {
      throw new ConflictException(`Processo em ${status} não está aguardando assinaturas`);
    }

    const linkExpiraEm = await this.emitirLink(signatario);
    await this.prisma.$transaction((tx) =>
      this.auditoria.registrar(tx, usuario, {
        acao: 'UPDATE',
        entidade: 'signatario',
        entidadeId: id,
        dadosDepois: { linkReenviado: true, tokenExpiraEm: linkExpiraEm },
      }),
    );
    return { signatarioId: id, linkExpiraEm };
  }

  // Página pública do link: diz quem deve assinar o quê, sem pedir login.
  async consultarLink(token: string) {
    const signatario = await this.carregarLink(token);
    const { documento } = signatario;
    return {
      nome: signatario.nome,
      papel: signatario.papel,
      email: mascararEmail(signatario.email),
      linkExpiraEm: signatario.tokenExpiraEm,
      otpAtivo: !!signatario.otpExpiraEm && signatario.otpExpiraEm > new Date(),
      documento: { id: documento.id, tipo: documento.tipo, nomeArquivo: documento.nomeArquivo },
    };
  }

  async enviarOtp(token: string) {
    const signatario = await this.carregarLink(token);
    const agora = Date.now();
    const codigo = gerarOtp();
    const otpExpiraEm = new Date(agora + OTP_VALIDADE_MS);

    // Grava só se o código anterior saiu há pelo menos OTP_INTERVALO_MS.
    // A condição fica no UPDATE para dois pedidos simultâneos não passarem juntos.
    const { count } = await this.prisma.signatario.updateMany({
      where: {
        id: signatario.id,
        OR: [
          { otpExpiraEm: null },
          { otpExpiraEm: { lte: new Date(agora + OTP_VALIDADE_MS - OTP_INTERVALO_MS) } },
        ],
      },
      data: { otpHash: await argon2Hash(codigo), otpExpiraEm, otpTentativas: 0 },
    });
    if (count === 0) {
      const emitidoEm = (signatario.otpExpiraEm?.getTime() ?? agora) - OTP_VALIDADE_MS;
      throw muitasTentativas({
        erro: 'otp_recente',
        motivo: 'Aguarde para pedir um novo código',
        aguardarSegundos: Math.max(Math.ceil((emitidoEm + OTP_INTERVALO_MS - agora) / 1000), 1),
      });
    }

    await this.email.enviar({
      para: signatario.email,
      ...emailCodigoOtp({ nome: signatario.nome, codigo, minutos: OTP_VALIDADE_MS / 60_000 }),
    });
    return { email: mascararEmail(signatario.email), otpExpiraEm };
  }

  // Confere o código sem consumi-lo: a assinatura confere de novo no ato.
  async verificarOtp(token: string, codigo: string) {
    const signatario = await this.carregarLink(token);
    await this.conferirOtp(signatario, codigo);
    return { valido: true };
  }

  async conferirOtp(
    signatario: Pick<SignatarioDoLink, 'id' | 'otpHash' | 'otpExpiraEm' | 'otpTentativas'>,
    codigo: string,
  ) {
    const { otpHash, otpExpiraEm } = signatario;
    if (!otpHash || !otpExpiraEm || otpExpiraEm <= new Date()) {
      throw new GoneException({ erro: 'otp_expirado', motivo: 'Peça um novo código' });
    }

    // Conta a tentativa antes de conferir, no próprio UPDATE: requisições
    // simultâneas não passam do limite. O otpHash na condição garante que o
    // código não foi trocado no meio.
    const { count } = await this.prisma.signatario.updateMany({
      where: { id: signatario.id, otpHash, otpTentativas: { lt: OTP_MAX_TENTATIVAS } },
      data: { otpTentativas: { increment: 1 } },
    });
    if (count === 0) {
      throw muitasTentativas({
        erro: 'otp_bloqueado',
        motivo: 'Tentativas esgotadas. Peça um novo código',
      });
    }

    if (!(await argon2Verify(otpHash, codigo))) {
      throw new BadRequestException({
        erro: 'otp_invalido',
        motivo: 'Código incorreto',
        tentativasRestantes: Math.max(OTP_MAX_TENTATIVAS - signatario.otpTentativas - 1, 0),
      });
    }

    // Quem acertou já sabe o código: zera as tentativas para o caminho normal
    // (verificar, abrir o PDF e assinar) não gastar o limite de erros.
    await this.prisma.signatario.updateMany({
      where: { id: signatario.id, otpHash },
      data: { otpTentativas: 0 },
    });
  }

  // URL temporária do PDF para quem tem o link e o código (RF-14: a tela só
  // libera o botão de assinar depois de o PDF ser lido até o fim).
  async urlDocumentoPorLink(token: string, codigo: string) {
    const signatario = await this.carregarLink(token);
    await this.conferirOtp(signatario, codigo);
    const { documento } = signatario;
    const url = await this.storage.urlAssinada(
      documento.storageKey,
      documento.nomeArquivo,
      documento.mimeType,
      VALIDADE_URL_DOCUMENTO_SEGUNDOS,
    );
    return { url, expiraEm: new Date(Date.now() + VALIDADE_URL_DOCUMENTO_SEGUNDOS * 1000) };
  }

  // Supervisor, diretor da ESP-MA e estagiário: link + OTP (método OTP).
  async assinarPorLink(token: string, codigo: string, evidencia: EvidenciaRequisicao) {
    const signatario = await this.carregarLink(token);
    await this.conferirOtp(signatario, codigo);
    return this.registrarAssinatura(signatario, MetodoAssinatura.OTP, evidencia);
  }

  // Representante da UNDB: assina logado e confirma a senha no ato (método SENHA).
  async assinarLogado(id: string, senha: string, usuario: UsuarioAutenticado, userAgent?: string) {
    const signatario = await this.prisma.signatario.findFirst({
      where: { id, usuarioId: usuario.id, papel: PapelSignatario.REPRESENTANTE_UNDB },
      include: { ...INCLUIR_NO_LINK, usuario: { select: { senhaHash: true } } },
    });
    if (!signatario) throw new NotFoundException('Signatário não encontrado');
    if (signatario.assinatura) {
      throw new ConflictException({
        erro: 'ja_assinado',
        motivo: 'Este documento já foi assinado',
      });
    }
    this.garantirAguardando(signatario.documento.processo.status);
    if (!signatario.usuario || !(await argon2Verify(signatario.usuario.senhaHash, senha))) {
      throw new UnauthorizedException({ erro: 'senha_invalida', motivo: 'Senha incorreta' });
    }
    return this.registrarAssinatura(
      signatario,
      MetodoAssinatura.SENHA,
      { ip: usuario.ip, userAgent },
      usuario.id,
    );
  }

  // Situação das assinaturas de um processo, por documento e por parte (US15).
  // O representante usa o id do próprio signatário para assinar.
  async listarPorProcesso(processoId: string, usuario: UsuarioAutenticado) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, ...this.escopo(usuario) },
      select: {
        id: true,
        status: true,
        documentos: {
          where: { signatarios: { some: {} } },
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            tipo: true,
            nomeArquivo: true,
            estagiarioId: true,
            codigoValidacao: true,
            signatarios: {
              orderBy: { papel: 'asc' },
              select: {
                id: true,
                papel: true,
                nome: true,
                email: true,
                usuarioId: true,
                linkEnviadoEm: true,
                tokenExpiraEm: true,
                assinatura: {
                  select: { assinadoEm: true, metodo: true, nivel: true, hashSha256: true },
                },
              },
            },
          },
        },
      },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    return {
      ...processo,
      documentos: processo.documentos.map((documento) => ({
        ...documento,
        codigoValidacao: documento.codigoValidacao && formatarCodigo(documento.codigoValidacao),
      })),
    };
  }

  // Grava a assinatura e as evidências numa transação só, com a auditoria e,
  // na última assinatura do processo, a transição para concluido.
  private async registrarAssinatura(
    signatario: SignatarioDoLink,
    metodo: MetodoAssinatura,
    evidencia: EvidenciaRequisicao,
    usuarioId?: string,
  ) {
    const { documento } = signatario;
    const processoId = documento.processo.id;

    // Hash do PDF calculado agora, sobre o arquivo do storage (não o do upload).
    // Se não bater com o registrado, o arquivo mudou depois do envio: ninguém
    // assina um conteúdo diferente do que os outros assinaram.
    const hashSha256 = calcularSha256(await this.storage.baixar(documento.storageKey));
    if (hashSha256 !== documento.hashSha256) {
      this.logger.error(
        `Hash do documento ${documento.id} no storage difere do registrado no upload`,
      );
      throw new ConflictException({
        erro: 'documento_alterado',
        motivo: 'O arquivo do documento não confere com o enviado. Avise a coordenação',
      });
    }

    const ip = evidencia.ip || 'desconhecido';
    const userAgent = evidencia.userAgent || 'desconhecido';
    const usuarioAuditoria = { id: usuarioId, ip };

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Trava o processo: duas últimas assinaturas simultâneas não podem
        // deixar de ver uma à outra e pular a transição para concluido.
        const [travado] = await tx.$queryRaw<{ status: StatusProcesso }[]>`
          SELECT status FROM processos WHERE id = ${processoId}::uuid FOR UPDATE`;
        this.garantirAguardando(travado?.status);

        const assinatura = await tx.assinatura.create({
          data: {
            signatarioId: signatario.id,
            documentoId: documento.id,
            hashSha256,
            metodo,
            aceite: true,
            ip,
            userAgent,
          },
        });
        // O código foi usado: não serve para outra assinatura.
        await tx.signatario.update({
          where: { id: signatario.id },
          data: { otpHash: null, otpExpiraEm: null },
        });
        await this.auditoria.registrar(tx, usuarioAuditoria, {
          acao: 'ASSINATURA',
          entidade: 'assinatura',
          entidadeId: assinatura.id,
          dadosDepois: {
            documentoId: documento.id,
            signatarioId: signatario.id,
            papel: signatario.papel,
            metodo,
            nivel: assinatura.nivel,
            hashSha256,
            userAgent,
            assinadoEm: assinatura.assinadoEm,
          },
        });

        const pendentes = await tx.signatario.count({
          where: { documento: { processoId }, assinatura: { is: null } },
        });
        if (pendentes === 0) {
          await tx.processo.update({
            where: { id: processoId },
            data: { status: StatusProcesso.concluido },
          });
          await this.auditoria.registrar(tx, usuarioAuditoria, {
            acao: 'UPDATE',
            entidade: 'processo',
            entidadeId: processoId,
            dadosAntes: { status: StatusProcesso.aguardando_assinaturas },
            dadosDepois: { status: StatusProcesso.concluido, motivo: 'ultima_assinatura' },
          });
        }

        return {
          assinaturaId: assinatura.id,
          assinadoEm: assinatura.assinadoEm,
          metodo,
          nivel: assinatura.nivel,
          hashSha256,
          codigoValidacao: documento.codigoValidacao && formatarCodigo(documento.codigoValidacao),
          processoConcluido: pendentes === 0,
        };
      });
    } catch (erro) {
      // Duas requisições do mesmo signatário: o índice único barrou a segunda.
      if ((erro as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          erro: 'ja_assinado',
          motivo: 'Este documento já foi assinado',
        });
      }
      throw erro;
    }
  }

  private garantirAguardando(status: StatusProcesso | undefined) {
    if (status !== StatusProcesso.aguardando_assinaturas) {
      throw new ConflictException({
        erro: 'assinatura_encerrada',
        motivo: 'O processo não está mais aguardando assinaturas',
      });
    }
  }

  // Valida o token do link. Público: a resposta não depende de login.
  async carregarLink(token: string): Promise<SignatarioDoLink> {
    const signatario = FORMATO_TOKEN.test(token)
      ? await this.prisma.signatario.findUnique({
          where: { tokenHash: hashToken(token) },
          include: INCLUIR_NO_LINK,
        })
      : null;
    if (!signatario || !signatario.tokenExpiraEm) {
      throw new NotFoundException({ erro: 'link_invalido', motivo: 'Link inválido' });
    }
    if (signatario.assinatura) {
      throw new ConflictException({
        erro: 'ja_assinado',
        motivo: 'Este documento já foi assinado',
      });
    }
    if (signatario.tokenExpiraEm <= new Date()) {
      throw new GoneException({
        erro: 'link_expirado',
        motivo: 'O link expirou. Peça um novo ao responsável pelo processo',
      });
    }
    this.garantirAguardando(signatario.documento.processo.status);
    return signatario;
  }

  // O token novo vale a partir do UPDATE; linkEnviadoEm só é gravado depois
  // do envio, para uma falha de e-mail não marcar o link como enviado.
  private async emitirLink(signatario: SignatarioParaLink): Promise<Date> {
    const { token, hash } = gerarToken();
    const expiraEm = new Date(Date.now() + LINK_VALIDADE_MS);
    await this.prisma.signatario.update({
      where: { id: signatario.id },
      data: {
        tokenHash: hash,
        tokenExpiraEm: expiraEm,
        otpHash: null,
        otpExpiraEm: null,
        otpTentativas: 0,
      },
    });
    await this.email.enviar({
      para: signatario.email,
      ...emailLinkAssinatura({
        nome: signatario.nome,
        papel: signatario.papel,
        url: this.urlDoLink(token),
        expiraEm,
      }),
    });
    await this.prisma.signatario.update({
      where: { id: signatario.id },
      data: { linkEnviadoEm: new Date() },
    });
    return expiraEm;
  }

  private urlDoLink(token: string): string {
    const base = (this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    return `${base}/assinar/${token}`;
  }

  // O diretor da ESP-MA é sempre a mesma pessoa: vem da configuração.
  private diretorEsp(): { nome: string; email: string } {
    const nome = this.config.get<string>('DIRETOR_ESP_NOME');
    const email = this.config.get<string>('DIRETOR_ESP_EMAIL');
    if (!nome || !email) {
      throw new ServiceUnavailableException(
        'Diretor da ESP-MA não configurado (DIRETOR_ESP_NOME e DIRETOR_ESP_EMAIL)',
      );
    }
    return { nome, email: email.trim().toLowerCase() };
  }

  // Mesmo escopo institucional do ProcessosService (ver escopo-processo.ts).
  private escopo(usuario: UsuarioAutenticado): Prisma.ProcessoWhereInput {
    return escopoProcesso(usuario);
  }
}
