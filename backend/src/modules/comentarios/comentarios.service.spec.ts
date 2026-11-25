import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Perfil, StatusProcesso, TipoComentario } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ProcessosService } from '../processos/processos.service.js';
import { ComentariosService } from './comentarios.service.js';

const PROCESSO = '11111111-1111-4111-8111-111111111111';
const DOCUMENTO = '22222222-2222-4222-8222-222222222222';
const COORDENACAO = { id: 'coord', perfil: Perfil.COORDENACAO_SES, ip: '10.0.0.1' };
const REPRESENTANTE = { id: 'rep', perfil: Perfil.REPRESENTANTE_UNDB, ip: '10.0.0.2' };
const PENDENCIA = { tipo: TipoComentario.pendencia, texto: 'x' };

function comentarioGravado(data: Record<string, unknown>) {
  return {
    id: 'c1',
    processoId: data.processoId,
    documentoId: data.documentoId,
    tipo: data.tipo,
    texto: data.texto,
    criadoEm: new Date('2026-11-25T12:00:00.000Z'),
    autor: { id: data.autorId, nome: 'Fulana', perfil: Perfil.COORDENACAO_SES },
  };
}

function montar(status: StatusProcesso = StatusProcesso.em_analise) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ status }]),
    documento: { findFirst: vi.fn().mockResolvedValue({ id: DOCUMENTO }) },
    comentario: {
      create: vi.fn(({ data }) => Promise.resolve(comentarioGravado(data))),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((operacao: (cliente: typeof tx) => unknown, _opcoes?: unknown) =>
      operacao(tx),
    ),
  };
  const processos = { garantirAcesso: vi.fn().mockResolvedValue(undefined) };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const service = new ComentariosService(
    prisma as unknown as PrismaService,
    processos as unknown as ProcessosService,
    auditoria as unknown as AuditoriaService,
  );
  return { tx, prisma, processos, auditoria, service };
}

// Formato real do erro do Prisma com o adapter pg (conferido contra um Postgres de verdade).
const violacaoDeFk = (restricao: string) =>
  Object.assign(new Error('FK'), {
    code: 'P2003',
    meta: {
      modelName: 'Comentario',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23503',
          kind: 'ForeignKeyConstraintViolation',
          constraint: { index: restricao },
        },
      },
    },
  });

const erroDe = (promessa: Promise<unknown>) =>
  promessa.then(
    () => undefined,
    (e: unknown) => e,
  );

describe('ComentariosService.criar', () => {
  it('a coordenação registra uma pendência no documento e recebe o comentário com o autor', async () => {
    const { tx, service } = montar(StatusProcesso.em_analise);

    const comentario = await service.criar(
      PROCESSO,
      DOCUMENTO,
      { tipo: TipoComentario.pendencia, texto: 'CPF ilegível' },
      COORDENACAO,
    );

    expect(tx.comentario.create).toHaveBeenCalledWith({
      data: {
        processoId: PROCESSO,
        documentoId: DOCUMENTO,
        autorId: 'coord',
        tipo: 'pendencia',
        texto: 'CPF ilegível',
      },
      select: expect.objectContaining({
        autor: { select: { id: true, nome: true, perfil: true } },
      }),
    });
    expect(comentario).toMatchObject({
      id: 'c1',
      processoId: PROCESSO,
      documentoId: DOCUMENTO,
      tipo: 'pendencia',
      texto: 'CPF ilegível',
      autor: { id: 'coord', nome: 'Fulana', perfil: Perfil.COORDENACAO_SES },
    });
  });

  it('o representante responde quando o processo voltou com pendência', async () => {
    const { tx, service } = montar(StatusProcesso.pendencia);

    await service.criar(
      PROCESSO,
      DOCUMENTO,
      { tipo: TipoComentario.resposta, texto: 'Apólice vigente reenviada.' },
      REPRESENTANTE,
    );

    expect(tx.comentario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ autorId: 'rep', tipo: 'resposta' }),
      }),
    );
  });

  it('audita a criação na mesma transação, sem copiar o texto para o log append-only', async () => {
    const { tx, auditoria, service } = montar();

    await service.criar(
      PROCESSO,
      DOCUMENTO,
      { tipo: TipoComentario.observacao, texto: 'CPF 123.456.789-09 divergente' },
      COORDENACAO,
    );

    expect(auditoria.registrar).toHaveBeenCalledExactlyOnceWith(tx, COORDENACAO, {
      acao: 'CREATE',
      entidade: 'comentario',
      entidadeId: 'c1',
      dadosDepois: {
        processoId: PROCESSO,
        documentoId: DOCUMENTO,
        autorId: 'coord',
        tipo: 'observacao',
      },
    });
    // O texto fica só em comentarios: a auditoria é imutável e não poderia ser anonimizada (LGPD).
    expect(JSON.stringify(auditoria.registrar.mock.calls)).not.toContain('123.456.789-09');
  });

  it('trava a linha do processo antes de ler o status, para não comentar durante uma troca de status', async () => {
    const { tx, service } = montar();

    await service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO);

    const [partes, ...valores] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(partes.join('?')).toMatch(/FROM processos WHERE id = \?::uuid FOR SHARE/);
    expect(valores).toEqual([PROCESSO]);
  });

  it('procura o documento só dentro do processo da rota', async () => {
    const { tx, service } = montar();

    await service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO);

    expect(tx.documento.findFirst).toHaveBeenCalledWith({
      where: { id: DOCUMENTO, processoId: PROCESSO },
      select: { id: true },
    });
  });

  it('espera por uma conexão do pool mais que os 2 s padrão do Prisma, para o pico entrar na fila', async () => {
    const m = montar();

    await m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO);

    const [, opcoes] = m.prisma.$transaction.mock.calls[0] as [unknown, { maxWait: number }];
    expect(opcoes.maxWait).toBeGreaterThanOrEqual(5_000);
  });

  describe('recusas (nada é gravado nem auditado)', () => {
    const naoGravou = (m: ReturnType<typeof montar>) => {
      expect(m.tx.comentario.create).not.toHaveBeenCalled();
      expect(m.auditoria.registrar).not.toHaveBeenCalled();
    };

    it('404 quando o usuário não enxerga o processo (representante de outro processo)', async () => {
      const m = montar();
      m.processos.garantirAcesso.mockRejectedValue(
        new NotFoundException('Processo não encontrado'),
      );

      const erro = await erroDe(
        m.service.criar(
          PROCESSO,
          DOCUMENTO,
          { tipo: TipoComentario.resposta, texto: 'x' },
          REPRESENTANTE,
        ),
      );

      expect(erro).toBeInstanceOf(NotFoundException);
      expect(m.processos.garantirAcesso).toHaveBeenCalledWith(PROCESSO, REPRESENTANTE);
      expect(m.prisma.$transaction).not.toHaveBeenCalled();
      naoGravou(m);
    });

    it('403 quando o representante tenta escrever pendência', async () => {
      const m = montar(StatusProcesso.pendencia);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, REPRESENTANTE));

      expect(erro).toBeInstanceOf(ForbiddenException);
      naoGravou(m);
    });

    it('403 quando a coordenação tenta responder no lugar da UNDB', async () => {
      const m = montar(StatusProcesso.pendencia);

      const erro = await erroDe(
        m.service.criar(
          PROCESSO,
          DOCUMENTO,
          { tipo: TipoComentario.resposta, texto: 'x' },
          COORDENACAO,
        ),
      );

      expect(erro).toBeInstanceOf(ForbiddenException);
      naoGravou(m);
    });

    it('409 status_invalido quando o processo já foi aprovado', async () => {
      const m = montar(StatusProcesso.aprovado);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({ erro: 'status_invalido' });
      naoGravou(m);
    });

    it('404 quando o documento não é deste processo', async () => {
      const m = montar();
      m.tx.documento.findFirst.mockResolvedValue(null);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(NotFoundException);
      expect((erro as NotFoundException).message).toBe('Documento não encontrado');
      naoGravou(m);
    });

    it('404 quando o processo some entre a checagem de acesso e o lock', async () => {
      const m = montar();
      m.tx.$queryRaw.mockResolvedValue([]);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(NotFoundException);
      naoGravou(m);
    });
  });

  describe('erros do banco', () => {
    it('documento apagado depois da checagem: a FK recusa e a resposta é 404, não 500', async () => {
      const m = montar();
      m.tx.comentario.create.mockRejectedValue(violacaoDeFk('comentarios_documento_id_fkey'));

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(NotFoundException);
      expect((erro as NotFoundException).message).toBe('Documento não encontrado');
      expect(m.auditoria.registrar).not.toHaveBeenCalled();
    });

    it('autor que não existe mais (token válido, usuário apagado): 401, não "documento não encontrado"', async () => {
      const m = montar();
      m.tx.comentario.create.mockRejectedValue(violacaoDeFk('comentarios_autor_id_fkey'));

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(UnauthorizedException);
    });

    it('violação de FK que não é do documento nem do autor segue como erro, sem virar 404', async () => {
      const m = montar();
      const falha = violacaoDeFk('comentarios_processo_id_fkey');
      m.tx.comentario.create.mockRejectedValue(falha);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBe(falha);
    });

    it('P2003 sem a informação da restrição também segue como erro', async () => {
      const m = montar();
      const falha = Object.assign(new Error('FK'), { code: 'P2003' });
      m.tx.comentario.create.mockRejectedValue(falha);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBe(falha);
    });

    it('pool esgotado mesmo assim (P2028): 503 pedindo nova tentativa, não 500', async () => {
      const m = montar();
      m.prisma.$transaction.mockRejectedValue(
        Object.assign(new Error('Unable to start a transaction in the given time.'), {
          code: 'P2028',
        }),
      );

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBeInstanceOf(ServiceUnavailableException);
      expect((erro as ServiceUnavailableException).message).toBe(
        'Sistema ocupado. Tente novamente em instantes',
      );
    });

    it('outros erros do banco não são disfarçados', async () => {
      const m = montar();
      const falha = Object.assign(new Error('conexão caiu'), { code: 'P1001' });
      m.tx.comentario.create.mockRejectedValue(falha);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBe(falha);
    });

    it('falha ao auditar derruba a operação inteira (o comentário não fica sem rastro)', async () => {
      const m = montar();
      const falha = new Error('auditoria fora');
      m.auditoria.registrar.mockRejectedValue(falha);

      const erro = await erroDe(m.service.criar(PROCESSO, DOCUMENTO, PENDENCIA, COORDENACAO));

      expect(erro).toBe(falha);
    });
  });
});

describe('ComentariosService.listarDoDocumento', () => {
  it('lista do mais antigo para o mais novo, com desempate estável, só do documento do processo', async () => {
    const { tx, processos, service } = montar();
    const lista = [{ id: 'a' }, { id: 'b' }];
    tx.comentario.findMany.mockResolvedValue(lista);

    const resultado = await service.listarDoDocumento(PROCESSO, DOCUMENTO, REPRESENTANTE);

    expect(resultado).toBe(lista);
    expect(processos.garantirAcesso).toHaveBeenCalledWith(PROCESSO, REPRESENTANTE);
    expect(tx.comentario.findMany).toHaveBeenCalledWith({
      where: { processoId: PROCESSO, documentoId: DOCUMENTO },
      select: expect.objectContaining({
        autor: { select: { id: true, nome: true, perfil: true } },
      }),
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  });

  it('o autor nunca expõe e-mail nem hash de senha', async () => {
    const { tx, service } = montar();

    await service.listarDoDocumento(PROCESSO, DOCUMENTO, COORDENACAO);

    const { select } = tx.comentario.findMany.mock.calls[0][0];
    expect(Object.keys(select.autor.select).sort()).toEqual(['id', 'nome', 'perfil']);
    expect(select).not.toHaveProperty('autorId');
  });

  it('404 sem acesso ao processo, sem consultar comentários', async () => {
    const { tx, processos, service } = montar();
    processos.garantirAcesso.mockRejectedValue(new NotFoundException());

    await expect(
      service.listarDoDocumento(PROCESSO, DOCUMENTO, REPRESENTANTE),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.comentario.findMany).not.toHaveBeenCalled();
  });

  it('404 quando o documento não é deste processo', async () => {
    const { tx, service } = montar();
    tx.documento.findFirst.mockResolvedValue(null);

    await expect(
      service.listarDoDocumento(PROCESSO, DOCUMENTO, COORDENACAO),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.comentario.findMany).not.toHaveBeenCalled();
  });
});

describe('ComentariosService.listarDoProcesso', () => {
  it('traz todos os comentários do processo, inclusive os de documentos já removidos', async () => {
    const { tx, processos, service } = montar();
    const lista = [{ id: 'a', documentoId: null }];
    tx.comentario.findMany.mockResolvedValue(lista);

    const resultado = await service.listarDoProcesso(PROCESSO, COORDENACAO);

    expect(resultado).toBe(lista);
    expect(processos.garantirAcesso).toHaveBeenCalledWith(PROCESSO, COORDENACAO);
    expect(tx.comentario.findMany).toHaveBeenCalledWith({
      where: { processoId: PROCESSO },
      select: expect.any(Object),
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    });
  });

  it('404 sem acesso ao processo', async () => {
    const { tx, processos, service } = montar();
    processos.garantirAcesso.mockRejectedValue(new NotFoundException());

    await expect(service.listarDoProcesso(PROCESSO, REPRESENTANTE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.comentario.findMany).not.toHaveBeenCalled();
  });
});
