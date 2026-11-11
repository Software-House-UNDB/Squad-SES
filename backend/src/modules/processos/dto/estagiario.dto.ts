import { PartialType } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

const seTexto = (ajuste: (valor: string) => string) => {
  return ({ value }: TransformFnParams) => (typeof value === 'string' ? ajuste(value) : value);
};
const aparar = seTexto((valor) => valor.trim());
const apenasDigitos = seTexto((valor) => valor.replace(/\D/g, ''));
const maiusculas = seTexto((valor) => valor.trim().toUpperCase());

// No CSV o valor chega como texto; o que não for reconhecido cai no IsBoolean.
const SIM_OU_NAO: Record<string, boolean> = {
  sim: true,
  s: true,
  true: true,
  '1': true,
  nao: false,
  não: false,
  n: false,
  false: false,
  '0': false,
};
const simOuNao = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? (SIM_OU_NAO[value.trim().toLowerCase()] ?? value) : value;

export function cpfValido(valor: unknown): boolean {
  if (typeof valor !== 'string' || !/^\d{11}$/.test(valor)) return false;
  if (/^(\d)\1{10}$/.test(valor)) return false;

  const digito = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(valor[i]) * (tamanho + 1 - i);
    }
    return ((soma * 10) % 11) % 10;
  };
  return digito(9) === Number(valor[9]) && digito(10) === Number(valor[10]);
}

@ValidatorConstraint({ name: 'cpf' })
class CpfValido implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    return cpfValido(valor);
  }

  defaultMessage() {
    return 'CPF inválido';
  }
}

@ValidatorConstraint({ name: 'data' })
class DataValida implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return false;
    }
    const data = new Date(valor);
    return !isNaN(data.getTime()) && data.toISOString().startsWith(valor);
  }

  defaultMessage() {
    return 'data inválida';
  }
}

@ValidatorConstraint({ name: 'periodoDoEstagio' })
class InicioAteTermino implements ValidatorConstraintInterface {
  validate(inicio: unknown, argumentos: ValidationArguments) {
    const { dataTermino } = argumentos.object as CriarEstagiarioDto;
    return !inicio || !dataTermino || String(inicio) <= dataTermino;
  }

  defaultMessage() {
    return 'data_inicio posterior a data_termino';
  }
}

export class CriarEstagiarioDto {
  @Transform(aparar)
  @IsString({ message: 'nome é obrigatório' })
  @IsNotEmpty({ message: 'nome é obrigatório' })
  nome: string;

  @Transform(apenasDigitos)
  @Validate(CpfValido)
  cpf: string;

  @Transform(aparar)
  @IsString({ message: 'matrícula é obrigatória' })
  @IsNotEmpty({ message: 'matrícula é obrigatória' })
  matricula: string;

  @Transform(aparar)
  @IsString({ message: 'curso é obrigatório' })
  @IsNotEmpty({ message: 'curso é obrigatório' })
  curso: string;

  @IsOptional()
  @Transform(simOuNao)
  @IsBoolean({ message: 'menor de idade inválido' })
  menorIdade?: boolean;

  // RF-13: o estagiário menor de idade precisa de um responsável.
  @ValidateIf((dto: CriarEstagiarioDto) => dto.menorIdade === true || dto.responsavelNome != null)
  @Transform(aparar)
  @IsString({ message: 'nome do responsável é obrigatório para menor de idade' })
  @IsNotEmpty({ message: 'nome do responsável é obrigatório para menor de idade' })
  responsavelNome?: string;

  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'cidade inválida' })
  @IsNotEmpty({ message: 'cidade inválida' })
  cidade?: string;

  @IsOptional()
  @Transform(maiusculas)
  @IsString({ message: 'UF inválida' })
  @Matches(/^[A-Z]{2}$/, { message: 'UF inválida' })
  uf?: string;

  @IsOptional()
  @Transform(apenasDigitos)
  @IsString({ message: 'CEP inválido' })
  @Matches(/^\d{8}$/, { message: 'CEP inválido' })
  cep?: string;

  @IsOptional()
  @Transform(aparar)
  @IsString({ message: 'tipo de liberação inválido' })
  tipoLiberacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'período inválido' })
  @Min(1, { message: 'período inválido' })
  periodo?: number;

  @IsOptional()
  @Validate(DataValida)
  @Validate(InicioAteTermino)
  dataInicio?: string;

  @IsOptional()
  @Validate(DataValida)
  dataTermino?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'horas por dia inválidas' })
  @Min(1, { message: 'horas por dia inválidas' })
  @Max(24, { message: 'horas por dia inválidas' })
  horasPorDia?: number;

  @IsOptional()
  @IsArray({ message: 'dias da semana inválidos' })
  @IsIn(DIAS_SEMANA, { each: true, message: 'dias da semana inválidos' })
  diasSemana?: string[];

  @IsOptional()
  @Matches(HORARIO, { message: 'horário de início inválido' })
  horarioInicio?: string;

  @IsOptional()
  @Matches(HORARIO, { message: 'horário de fim inválido' })
  horarioFim?: string;
}

export class AtualizarEstagiarioDto extends PartialType(CriarEstagiarioDto) {}
