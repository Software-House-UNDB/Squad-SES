-- Lembrete diário para quem ainda não assinou (cron de lembretes). Aditiva.
-- AlterTable
ALTER TABLE "signatarios" ADD COLUMN     "lembrete_enviado_em" TIMESTAMPTZ(3),
ADD COLUMN     "lembretes_enviados" INTEGER NOT NULL DEFAULT 0;

-- AddCheck: o contador de lembretes nunca fica negativo (como otp_tentativas).
ALTER TABLE "signatarios" ADD CONSTRAINT "signatarios_lembretes_nao_negativo" CHECK ("lembretes_enviados" >= 0);
