# Teste de estresse HTTP

`retorno.stress.mjs` bate numa API real (retorno da coordenação #24/#48 e auditoria #49): rajadas de
uploads, corrida do mesmo arquivo, exclusões concorrentes, permissões e status em paralelo.

Use **sempre** banco e bucket descartáveis. Exemplo com o Postgres/MinIO do `docker-compose`:

```bash
docker exec ses_postgres psql -U postgres -c "CREATE DATABASE ses_stress"
# variáveis do backend/.env.example, trocando DATABASE_URL (ses_stress), S3_BUCKET e PORT=3999
npx prisma migrate deploy && node dist/scripts/seed.js && node dist/main &
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ses_stress node backend/test/stress/retorno.stress.mjs
```

Sai com código 1 se qualquer verificação falhar. Parâmetros: `STRESS_UPLOADS`, `STRESS_CORRIDA`, `STRESS_CONCORRENCIA`.
