-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('oficio', 'oficio_alteracao', 'termo_compromisso', 'kit_estagio', 'anexo');

-- AlterTable
ALTER TABLE "estagiarios" ADD COLUMN     "data_inicio" DATE,
ADD COLUMN     "data_termino" DATE,
ADD COLUMN     "dias_semana" TEXT[],
ADD COLUMN     "horario_fim" CHAR(5),
ADD COLUMN     "horario_inicio" CHAR(5),
ADD COLUMN     "horas_por_dia" INTEGER,
ADD COLUMN     "periodo" INTEGER,
ADD COLUMN     "tipo_liberacao" TEXT;

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "observacao_analise" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "instituicao" TEXT;

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "estagiario_id" UUID,
    "tipo" "tipo_documento" NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "hash_sha256" CHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "dados_antes" JSONB,
    "dados_depois" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_storage_key_key" ON "documentos"("storage_key");

-- CreateIndex
CREATE INDEX "documentos_processo_id_idx" ON "documentos"("processo_id");

-- CreateIndex
CREATE INDEX "documentos_estagiario_id_idx" ON "documentos"("estagiario_id");

-- CreateIndex
CREATE INDEX "documentos_enviado_por_id_idx" ON "documentos"("enviado_por_id");

-- CreateIndex
CREATE INDEX "auditoria_entidade_entidade_id_idx" ON "auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_criado_em_idx" ON "auditoria"("criado_em");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_estagiario_id_fkey" FOREIGN KEY ("estagiario_id") REFERENCES "estagiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
