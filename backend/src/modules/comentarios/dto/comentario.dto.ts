import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches, ValidateBy } from 'class-validator';
import { TipoComentario } from '../../../generated/prisma/enums.js';

// Mesmo número do frontend (LIMITE_COMENTARIO em AnaliseProcesso/analise.ts).
export const LIMITE_TEXTO_COMENTARIO = 1000;

// Conta pontos de código, exatamente como o char_length do CHECK no banco. O
// @MaxLength do class-validator não serve: ele desconta os seletores de variação
// (U+FE0E/U+FE0F), então um texto aceito aqui era recusado pelo banco (erro 500).
// O frontend conta unidades UTF-16 (emoji vale 2): é mais rígido, o que não causa erro.
const NoMaximoCaracteres = (maximo: number) =>
  ValidateBy({
    name: 'noMaximoCaracteres',
    validator: {
      validate: (valor: unknown) => typeof valor === 'string' && [...valor].length <= maximo,
      defaultMessage: () => `texto passa de ${maximo} caracteres`,
    },
  });

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CriarComentarioDto {
  @ApiProperty({
    enum: TipoComentario,
    enumName: 'TipoComentario',
    description:
      'pendencia e observacao: só a coordenação SES. resposta: só o representante da UNDB.',
  })
  @IsEnum(TipoComentario, { message: 'tipo inválido' })
  tipo: TipoComentario;

  @ApiProperty({
    minLength: 1,
    maxLength: LIMITE_TEXTO_COMENTARIO,
    example: 'A apólice está vencida. Envie a vigente.',
  })
  @Transform(aparar)
  @IsString({ message: 'texto inválido' })
  // Espaço e caractere invisível (zero-width) não contam como conteúdo.
  @Matches(/[^\s\p{Cf}]/u, { message: 'texto sem conteúdo' })
  // O Postgres recusa o byte nulo em texto, o que viraria erro 500.
  // oxlint-disable-next-line no-control-regex -- o caractere de controle é o alvo da regra
  @Matches(/^[^\u0000]*$/, { message: 'texto com caractere inválido' })
  @NoMaximoCaracteres(LIMITE_TEXTO_COMENTARIO)
  texto: string;
}
