import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { ComentariosService } from './comentarios.service.js';
import { CriarComentarioDto } from './dto/comentario.dto.js';

// Comentários da análise (RF-12). Não há PATCH nem DELETE: o comentário é histórico.
@ApiTags('comentarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('processos/:processoId')
export class ComentariosController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Post('documentos/:documentoId/comentarios')
  criar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Body() dto: CriarComentarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.comentarios.criar(processoId, documentoId, dto, usuario);
  }

  @Get('documentos/:documentoId/comentarios')
  listarDoDocumento(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.comentarios.listarDoDocumento(processoId, documentoId, usuario);
  }

  // Todos de uma vez (a tela de análise evita uma chamada por documento); inclui
  // os comentários de documentos já removidos.
  @Get('comentarios')
  listarDoProcesso(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.comentarios.listarDoProcesso(processoId, usuario);
  }
}
