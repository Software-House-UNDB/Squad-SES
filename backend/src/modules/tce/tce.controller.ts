import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfil } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Perfis } from '../auth/perfis.decorator.js';
import { PerfisGuard } from '../auth/perfis.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { TceService } from './tce.service.js';

@ApiTags('processos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PerfisGuard)
@Controller('processos/:processoId/tces')
export class TceController {
  constructor(private readonly tces: TceService) {}

  // Coordenação SES, processo em "aprovado". Gera um TCE por estagiário e
  // substitui os que existirem; os PDFs saem na listagem de documentos.
  @Post()
  @Perfis(Perfil.COORDENACAO_SES)
  gerar(
    @Param('processoId', ParseUUIDPipe) processoId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.tces.gerar(processoId, usuario);
  }
}
