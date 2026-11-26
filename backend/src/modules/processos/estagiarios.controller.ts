import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Perfil } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Perfis } from '../auth/perfis.decorator.js';
import { PerfisGuard } from '../auth/perfis.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AtualizarEstagiarioDto, CriarEstagiarioDto } from './dto/estagiario.dto.js';
import { EstagiariosService } from './estagiarios.service.js';

const TAMANHO_MAXIMO_CSV = 1024 * 1024;

@ApiTags('estagiarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PerfisGuard)
@Controller('processos/:processoId/estagiarios')
export class EstagiariosController {
  constructor(private readonly estagiarios: EstagiariosService) {}

  @Post('lote')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { arquivo: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO_CSV } }))
  importarLote(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UploadedFile() arquivo: { buffer: Buffer } | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    if (!arquivo) {
      throw new BadRequestException({
        erro: 'csv_invalido',
        motivo: 'envie o arquivo no campo "arquivo"',
      });
    }
    return this.estagiarios.importarLote(processoId, arquivo.buffer, usuario);
  }

  @Post()
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Body() dto: CriarEstagiarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.estagiarios.criar(processoId, dto, usuario);
  }

  @Get()
  listar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.estagiarios.listar(processoId, usuario);
  }

  @Get(':id')
  buscar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.estagiarios.buscar(processoId, id, usuario);
  }

  @Patch(':id')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  atualizar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarEstagiarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.estagiarios.atualizar(processoId, id, dto, usuario);
  }

  @Delete(':id')
  @Perfis(Perfil.REPRESENTANTE_UNDB)
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.estagiarios.remover(processoId, id, usuario);
  }
}
