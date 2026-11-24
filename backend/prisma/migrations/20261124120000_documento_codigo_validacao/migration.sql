-- Código público de validação de documento assinado (RF-17). Aditiva: coluna opcional.
-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "codigo_validacao" CHAR(12);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_codigo_validacao_key" ON "documentos"("codigo_validacao");

-- AddCheck: base32 de Crockford (sem I, L, O, U), maiúsculo, sem hífens.
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_codigo_validacao_formato" CHECK ("codigo_validacao" ~ '^[0-9A-HJKMNP-TV-Z]{12}$');
