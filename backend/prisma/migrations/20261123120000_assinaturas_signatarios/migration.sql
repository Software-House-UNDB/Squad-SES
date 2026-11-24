-- CreateEnum
CREATE TYPE "papel_signatario" AS ENUM ('REPRESENTANTE_UNDB', 'SUPERVISOR', 'DIRETOR_ESP', 'ESTAGIARIO');

-- CreateEnum
CREATE TYPE "metodo_assinatura" AS ENUM ('SENHA', 'OTP');

-- CreateEnum
CREATE TYPE "nivel_assinatura" AS ENUM ('SIMPLES', 'AVANCADA', 'QUALIFICADA');

-- AlterTable
ALTER TABLE "estagiarios" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "supervisor_email" TEXT,
ADD COLUMN     "supervisor_nome" TEXT;

-- CreateTable
CREATE TABLE "signatarios" (
    "id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "papel" "papel_signatario" NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "usuario_id" UUID,
    "estagiario_id" UUID,
    "token_hash" CHAR(64),
    "token_expira_em" TIMESTAMPTZ(3),
    "link_enviado_em" TIMESTAMPTZ(3),
    "otp_hash" TEXT,
    "otp_expira_em" TIMESTAMPTZ(3),
    "otp_tentativas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signatarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL,
    "signatario_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "hash_sha256" CHAR(64) NOT NULL,
    "metodo" "metodo_assinatura" NOT NULL,
    "nivel" "nivel_assinatura" NOT NULL DEFAULT 'SIMPLES',
    "aceite" BOOLEAN NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "assinado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signatarios_token_hash_key" ON "signatarios"("token_hash");

-- CreateIndex
CREATE INDEX "signatarios_usuario_id_idx" ON "signatarios"("usuario_id");

-- CreateIndex
CREATE INDEX "signatarios_estagiario_id_idx" ON "signatarios"("estagiario_id");

-- CreateIndex
CREATE UNIQUE INDEX "signatarios_documento_id_papel_key" ON "signatarios"("documento_id", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_signatario_id_key" ON "assinaturas"("signatario_id");

-- CreateIndex
CREATE INDEX "assinaturas_documento_id_idx" ON "assinaturas"("documento_id");

-- AddForeignKey
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_estagiario_id_fkey" FOREIGN KEY ("estagiario_id") REFERENCES "estagiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_signatario_id_fkey" FOREIGN KEY ("signatario_id") REFERENCES "signatarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (CHECK e trigger não entram no diff dele).

-- AddCheck: o aceite explícito ("Li e concordo") é obrigatório (RF-15).
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_aceite_obrigatorio" CHECK ("aceite" = true);

-- AddCheck: hash em hexadecimal minúsculo, como em documentos.
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_hash_hex" CHECK ("hash_sha256" ~ '^[0-9a-f]{64}$');

-- AddCheck: o contador de tentativas de OTP nunca fica negativo.
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_otp_tentativas_nao_negativo" CHECK ("otp_tentativas" >= 0);

-- AddCheck: o representante da UNDB assina logado, então precisa do usuário;
-- o estagiário aponta para o cadastro dele. Os demais papéis não têm vínculo.
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_vinculo_por_papel" CHECK (
  ("papel" = 'REPRESENTANTE_UNDB' AND "usuario_id" IS NOT NULL AND "estagiario_id" IS NULL)
  OR ("papel" = 'ESTAGIARIO' AND "estagiario_id" IS NOT NULL AND "usuario_id" IS NULL)
  OR ("papel" IN ('SUPERVISOR', 'DIRETOR_ESP') AND "usuario_id" IS NULL AND "estagiario_id" IS NULL)
);

-- As evidências de assinatura são append-only, como a auditoria: só INSERT.
-- CreateFunction
CREATE FUNCTION "bloquear_alteracao_append_only"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela % é append-only: % não é permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- CreateTrigger
CREATE TRIGGER "assinaturas_sem_update_delete"
BEFORE UPDATE OR DELETE ON "assinaturas"
FOR EACH ROW EXECUTE FUNCTION "bloquear_alteracao_append_only"();

-- CreateTrigger
CREATE TRIGGER "assinaturas_sem_truncate"
BEFORE TRUNCATE ON "assinaturas"
FOR EACH STATEMENT EXECUTE FUNCTION "bloquear_alteracao_append_only"();
