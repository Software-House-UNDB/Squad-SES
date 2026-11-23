import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AssinaturasService } from './assinaturas.service.js';
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
