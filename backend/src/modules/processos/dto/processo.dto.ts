import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { StatusProcesso, TipoEstagio } from '../../../generated/prisma/enums.js';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emailNormalizado = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CriarProcessoDto {
  @IsOptional()
  @IsEnum(TipoEstagio, { message: 'tipoEstagio inválido' })
  tipoEstagio?: TipoEstagio;

  // Supervisor do campo de estágio, que assina o TCE por link (RF-04).
  // Opcional aqui; obrigatório antes do envio para assinatura.
  @ApiPropertyOptional({ example: 'Maria Souza' })
  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'supervisorNome inválido' })
  @IsNotEmpty({ message: 'supervisorNome inválido' })
  @MaxLength(200, { message: 'supervisorNome passa de 200 caracteres' })
  supervisorNome?: string;

  @ApiPropertyOptional({ example: 'maria.souza@saude.ma.gov.br' })
  @IsOptional()
  @Transform(emailNormalizado)
  @IsEmail({}, { message: 'supervisorEmail inválido' })
  supervisorEmail?: string;
}

export class AtualizarProcessoDto extends PartialType(CriarProcessoDto) {}

// Texto vazio ou null limpa a observação.
export class AnalisarProcessoDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: 'Observação da coordenação. Texto vazio ou null limpa a observação.',
    example: 'Falta o CPF do estagiário no TCE.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((dto: AnalisarProcessoDto) => dto.observacaoAnalise !== null)
  @IsString({ message: 'observacaoAnalise inválida' })
  @MaxLength(2000, { message: 'observacaoAnalise passa de 2000 caracteres' })
  observacaoAnalise: string | null;
}

// em_analise -> pendencia: o motivo é obrigatório e vira a observacaoAnalise.
export class ApontarPendenciaDto {
  @ApiProperty({
    maxLength: 2000,
    description: 'O que o representante precisa corrigir antes de reenviar.',
    example: 'A apólice está vencida. Envie a vigente.',
  })
  @Transform(aparar)
  @IsString({ message: 'motivo é obrigatório' })
  @IsNotEmpty({ message: 'motivo é obrigatório' })
  @MaxLength(2000, { message: 'motivo passa de 2000 caracteres' })
  motivo: string;
}

export class ListarProcessosDto {
  @ApiPropertyOptional({ enum: StatusProcesso, enumName: 'StatusProcesso' })
  @IsOptional()
  @IsEnum(StatusProcesso, { message: 'status inválido' })
  status?: StatusProcesso;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina inválida' })
  @Min(1, { message: 'pagina inválida' })
  pagina: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite inválido' })
  @Min(1, { message: 'limite inválido' })
  @Max(100, { message: 'limite inválido' })
  limite: number = 20;
}
