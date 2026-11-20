-- Fecha a corrida de duplicata do upload (issue #31): duas requisições simultâneas
-- com o mesmo PDF podiam passar ambas pelo findFirst antes do create.
-- Se a criação falhar por duplicatas que já existem, liste-as com:
--   SELECT processo_id, hash_sha256, count(*) FROM documentos
--   GROUP BY 1, 2 HAVING count(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX "documentos_processo_hash_unico" ON "documentos"("processo_id", "hash_sha256");

-- O índice único começa por processo_id e já atende às buscas por processo.
-- DropIndex
DROP INDEX "documentos_processo_id_idx";
