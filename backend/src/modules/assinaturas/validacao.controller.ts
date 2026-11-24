import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { type ArquivoRecebido, TAMANHO_MAXIMO_ARQUIVO } from '../documentos/arquivo.js';
import { ValidacaoService } from './validacao.service.js';

// Rotas públicas: qualquer pessoa com o código confere o documento (RF-17).
@ApiTags('validacao')
@Controller('validacao')
export class ValidacaoController {
  constructor(private readonly validacao: ValidacaoService) {}

  @Get(':codigo')
  consultar(@Param('codigo') codigo: string) {
    return this.validacao.consultar(codigo);
  }

  @Post(':codigo/arquivo')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['arquivo'],
      properties: { arquivo: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO } }))
  verificarArquivo(
    @Param('codigo') codigo: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
  ) {
    if (!arquivo) {
      throw new BadRequestException({
        erro: 'arquivo_invalido',
        motivo: 'envie o arquivo no campo "arquivo"',
      });
    }
    return this.validacao.verificarArquivo(codigo, arquivo.buffer);
  }
}
