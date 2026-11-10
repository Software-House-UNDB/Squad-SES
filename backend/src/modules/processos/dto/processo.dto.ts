import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StatusProcesso, TipoEstagio } from '../../../generated/prisma/enums.js';

export class CriarProcessoDto {
  @IsEnum(TipoEstagio, { message: 'tipoEstagio inválido' })
  tipoEstagio: TipoEstagio;
}

export class AtualizarProcessoDto extends PartialType(CriarProcessoDto) {}

export class ListarProcessosDto {
  @IsOptional()
  @IsEnum(StatusProcesso, { message: 'status inválido' })
  status?: StatusProcesso;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina inválida' })
  @Min(1, { message: 'pagina inválida' })
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite inválido' })
  @Min(1, { message: 'limite inválido' })
  @Max(100, { message: 'limite inválido' })
  limite: number = 20;
}
