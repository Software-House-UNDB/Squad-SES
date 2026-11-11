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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuarioAtual, type UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import {
  AnalisarProcessoDto,
  AtualizarProcessoDto,
  CriarProcessoDto,
  ListarProcessosDto,
} from './dto/processo.dto.js';
import { ProcessosService } from './processos.service.js';

@ApiTags('processos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('processos')
export class ProcessosController {
  constructor(private readonly processos: ProcessosService) {}

  @Post()
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
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarProcessoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.atualizar(id, dto, usuario);
  }

  @Patch(':id/analise')
  analisar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnalisarProcessoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.processos.analisar(id, dto, usuario);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.processos.remover(id, usuario);
  }
}
