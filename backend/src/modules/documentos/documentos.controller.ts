import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuthTemporarioGuard } from '../auth/auth-temporario.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { TipoDocumento } from '../../generated/prisma/enums.js';
import { type ArquivoRecebido, TAMANHO_MAXIMO_ARQUIVO } from './arquivo.js';
import { DocumentosService } from './documentos.service.js';
import { EnviarDocumentoDto } from './dto/documento.dto.js';

@ApiTags('documentos')
@ApiHeader({ name: 'x-usuario-id', description: 'Temporário, até o JWT' })
@UseGuards(AuthTemporarioGuard)
@Controller('processos/:processoId/documentos')
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['arquivo', 'tipo'],
      properties: {
        arquivo: { type: 'string', format: 'binary' },
        tipo: { type: 'string', enum: Object.values(TipoDocumento) },
        estagiarioId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO } }))
  enviar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
    @Body() dto: EnviarDocumentoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    if (!arquivo) {
      throw new BadRequestException({
        erro: 'arquivo_invalido',
        motivo: 'envie o arquivo no campo "arquivo"',
      });
    }
    return this.documentos.enviar(processoId, arquivo, dto, usuario);
  }

  @Get()
  listar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.documentos.listar(processoId, usuario);
  }

  @Get(':id/url')
  gerarUrl(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.documentos.gerarUrl(processoId, id, usuario);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.documentos.remover(processoId, id, usuario);
  }
}
