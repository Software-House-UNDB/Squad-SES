-- CreateEnum
CREATE TYPE "tipo_comentario" AS ENUM ('pendencia', 'observacao', 'resposta');

-- CreateTable
CREATE TABLE "comentarios" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "documento_id" UUID,
    "documento_tipo" "tipo_documento",
    "documento_nome_arquivo" TEXT,
    "autor_id" UUID NOT NULL,
    "tipo" "tipo_comentario" NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- Rede de segurança do banco para o tamanho do texto (1 a 1000 caracteres, contados
-- como char_length). A API valida antes e é mais rígida: também apara as pontas e
-- recusa texto só com caracteres invisíveis. Mesmo padrão do CHECK do aceite em assinaturas.
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_texto_tamanho"
    CHECK (char_length(btrim("texto")) >= 1 AND char_length("texto") <= 1000);

-- CreateIndex
CREATE INDEX "comentarios_processo_id_criado_em_idx" ON "comentarios"("processo_id", "criado_em");

-- CreateIndex
CREATE INDEX "comentarios_documento_id_criado_em_idx" ON "comentarios"("documento_id", "criado_em");

-- CreateIndex
CREATE INDEX "comentarios_autor_id_idx" ON "comentarios"("autor_id");

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
