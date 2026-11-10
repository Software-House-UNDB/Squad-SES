import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TipoDocumento } from '../../../generated/prisma/enums.js';

// Campos de texto do multipart, ao lado do campo "arquivo".
export class EnviarDocumentoDto {
  @IsEnum(TipoDocumento, { message: 'tipo inválido' })
  tipo: TipoDocumento;

  @IsOptional()
  @IsUUID('all', { message: 'estagiarioId inválido' })
  estagiarioId?: string;
}
