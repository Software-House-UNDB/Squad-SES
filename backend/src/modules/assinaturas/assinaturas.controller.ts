import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AssinaturasService } from './assinaturas.service.js';
import { AssinarLogadoDto, AssinarPorLinkDto } from './dto/assinar.dto.js';
import { VerificarOtpDto } from './dto/verificar-otp.dto.js';

@ApiTags('assinaturas')
@Controller('assinaturas')
export class AssinaturasController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  // Rotas do link: públicas, porque supervisor, diretor da ESP-MA e
  // estagiário não têm login (RF-04). O token do link é a credencial.
  @Get('link/:token')
  consultarLink(@Param('token') token: string) {
    return this.assinaturas.consultarLink(token);
  }

  @Post('link/:token/otp')
  @HttpCode(200)
  enviarOtp(@Param('token') token: string) {
    return this.assinaturas.enviarOtp(token);
  }

  @Post('link/:token/otp/verificar')
  @HttpCode(200)
  verificarOtp(@Param('token') token: string, @Body() dto: VerificarOtpDto) {
    return this.assinaturas.verificarOtp(token, dto.codigo);
  }

  // Com o código válido, devolve uma URL temporária (5 min) do PDF.
  @Post('link/:token/documento')
  @HttpCode(200)
  urlDocumento(@Param('token') token: string, @Body() dto: VerificarOtpDto) {
    return this.assinaturas.urlDocumentoPorLink(token, dto.codigo);
  }

  @Post('link/:token/assinar')
  @HttpCode(201)
  assinarPorLink(
    @Param('token') token: string,
    @Body() dto: AssinarPorLinkDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.assinaturas.assinarPorLink(token, dto.codigo, { ip, userAgent });
  }

  @Post('signatarios/:id/assinar')
  @HttpCode(201)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  assinarLogado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssinarLogadoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.assinaturas.assinarLogado(id, dto.senha, usuario, userAgent);
  }

  @Get('processos/:processoId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listarPorProcesso(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.assinaturas.listarPorProcesso(processoId, usuario);
  }

  @Post('signatarios/:id/reenviar-link')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  reenviarLink(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.assinaturas.reenviarLink(id, usuario);
  }
}
