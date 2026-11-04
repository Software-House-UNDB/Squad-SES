-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('COORDENACAO_SES', 'REPRESENTANTE_UNDB');

-- CreateEnum
CREATE TYPE "status_processo" AS ENUM ('rascunho', 'enviado', 'em_analise', 'pendencia', 'aprovado', 'aguardando_assinaturas', 'concluido');

-- CreateEnum
CREATE TYPE "tipo_estagio" AS ENUM ('obrigatorio', 'pos_graduacao');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "perfil" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processos" (
    "id" UUID NOT NULL,
    "tipo_estagio" "tipo_estagio" NOT NULL,
    "status" "status_processo" NOT NULL DEFAULT 'rascunho',
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estagiarios" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "matricula" TEXT NOT NULL,
    "curso" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "cep" CHAR(8) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estagiarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "processos_status_idx" ON "processos"("status");

-- CreateIndex
CREATE INDEX "processos_criado_por_id_idx" ON "processos"("criado_por_id");

-- CreateIndex
CREATE UNIQUE INDEX "estagiarios_processo_id_cpf_key" ON "estagiarios"("processo_id", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "estagiarios_processo_id_matricula_key" ON "estagiarios"("processo_id", "matricula");

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estagiarios" ADD CONSTRAINT "estagiarios_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
