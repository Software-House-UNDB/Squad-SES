import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Perfis } from '../auth/perfis.decorator.js';
import { PerfisGuard } from '../auth/perfis.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import {
  AnalisarProcessoDto,
  ApontarPendenciaDto,
  AtualizarProcessoDto,
  CriarProcessoDto,
  ListarProcessosDto,
} from './dto/processo.dto.js';
import { ProcessosService } from './processos.service.js';

@ApiTags('processos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PerfisGuard)
@Controller('processos')
export class ProcessosController {
  constructor(private readonly processos: ProcessosService) {}

  @Post()
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  criar(@Body() dto: CriarProcessoDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.criar(dto, usuario);
  }

  @Get()
  listar(@Query() filtro: ListarProcessosDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.listar(filtro, usuario);
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.buscar(id, usuario);
  }

  @Patch(':id')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarProcessoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.atualizar(id, dto, usuario);
  }

  @Patch(':id/analise')
  @Perfis(Perfil.COORDENACAO_SES)
  analisar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnalisarProcessoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.analisar(id, dto, usuario);
  }

  // --- Máquina de estados (RF-07) ---

  @Post(':id/enviar')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Envia o processo à coordenação (rascunho → enviado; pendencia → enviado no reenvio)',
    description:
      'Representante UNDB. 409 se o status atual não permite o envio; 400 (pacote_incompleto) ' +
      'com a lista de pendências se faltar estagiário ou documento obrigatório (RF-08).',
  })
  enviar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.enviar(id, usuario);
  }

  @Post(':id/iniciar-analise')
  @Perfis(Perfil.COORDENACAO_SES)
  @HttpCode(200)
  @ApiOperation({ summary: 'Coordenação assume a análise (enviado → em_analise)' })
  iniciarAnalise(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.iniciarAnalise(id, usuario);
  }

  @Post(':id/pendencia')
  @Perfis(Perfil.COORDENACAO_SES)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Coordenação devolve com pendência (em_analise ou aprovado → pendencia)',
    description:
      'O motivo é obrigatório e fica em observacaoAnalise. De aprovado, só antes do ' +
      'início das assinaturas (depois o status já é aguardando_assinaturas).',
  })
  apontarPendencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApontarPendenciaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.apontarPendencia(id, dto, usuario);
  }

  @Post(':id/aprovar')
  @Perfis(Perfil.COORDENACAO_SES)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Coordenação aprova (em_analise → aprovado)',
    description:
      'A ida para aguardando_assinaturas é feita em POST /assinaturas/processos/:id/iniciar.',
  })
  aprovar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.aprovar(id, usuario);
  }

  @Delete(':id')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.remover(id, usuario);
  }
}
