-- AlterEnum
ALTER TYPE "tipo_documento" ADD VALUE 'plano_atividades';
ALTER TYPE "tipo_documento" ADD VALUE 'apolice';
ALTER TYPE "tipo_documento" ADD VALUE 'lista_indicados';
ALTER TYPE "tipo_documento" ADD VALUE 'documento_pessoal';
ALTER TYPE "tipo_documento" ADD VALUE 'declaracao';

-- AlterTable
ALTER TABLE "processos" ALTER COLUMN "tipo_estagio" DROP NOT NULL;

-- AlterTable
ALTER TABLE "estagiarios" ADD COLUMN     "menor_idade" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsavel_nome" TEXT,
ALTER COLUMN "cidade" DROP NOT NULL,
ALTER COLUMN "uf" DROP NOT NULL,
ALTER COLUMN "cep" DROP NOT NULL;
