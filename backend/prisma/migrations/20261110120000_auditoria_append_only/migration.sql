-- A trilha de auditoria é append-only: só INSERT é permitido.
-- Os triggers recusam UPDATE, DELETE e TRUNCATE, inclusive para o usuário da aplicação.
-- Observação: o dono da tabela ainda consegue remover os triggers (DROP/DISABLE TRIGGER);
-- isso é uma operação de DBA, não algo que a API executa.

-- CreateFunction
CREATE FUNCTION "auditoria_bloquear_alteracao"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela auditoria é append-only: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- CreateTrigger
CREATE TRIGGER "auditoria_sem_update_delete"
BEFORE UPDATE OR DELETE ON "auditoria"
FOR EACH ROW EXECUTE FUNCTION "auditoria_bloquear_alteracao"();

-- CreateTrigger
CREATE TRIGGER "auditoria_sem_truncate"
BEFORE TRUNCATE ON "auditoria"
FOR EACH STATEMENT EXECUTE FUNCTION "auditoria_bloquear_alteracao"();
