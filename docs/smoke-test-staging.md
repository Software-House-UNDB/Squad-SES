# Smoke Test Staging — Squad-SES

Checklist de validação end-to-end do ambiente de staging. Usa URLs públicas, não pede acesso a painel. Rodar no fim de cada sprint antes de promover `dev` → `main` e antes da homologação final (01–07/12/2026).

## Ambientes

| Camada | URL | Como foi provisionado |
|---|---|---|
| Frontend | https://squad-ses-frontend.vercel.app | Vercel Hobby, GitHub App na org Software-House-UNDB — ver [README_CI.md](../README_CI.md#vercel-provisionado-em-1011) |
| Backend  | https://squad-ses-backend.onrender.com | Render Free Web Service |
| DB       | Neon (serverless Postgres) | Connection string injetada como `DATABASE_URL` no Render |
| Storage  | Backblaze B2 (via API S3) | Application Keys injetadas como `S3_*` no Render — ver [README_CI.md](../README_CI.md#backblaze-b2-storage-prod) |

Exemplos de `curl` abaixo assumem `BASE=https://squad-ses-backend.onrender.com`.

## Nível 1 — Smoke de infraestrutura

Valida que a plataforma está no ar, roteamento OK, HTTPS OK, app inicializou. **Não exige autenticação.** Pode rodar a qualquer momento.

### Checklist

- [ ] `GET https://squad-ses-frontend.vercel.app/login` → HTTP 200, HTML renderiza (tela de login aparece)
- [ ] `GET $BASE/` → HTTP 200, body `Hello World!`
- [ ] `GET $BASE/health` → HTTP 200, JSON `{"status":"ok","timestamp":"..."}`
- [ ] `GET $BASE/docs` → HTTP 200, Swagger UI abre
- [ ] `GET $BASE/docs-json` → HTTP 200, OpenAPI JSON válido
- [ ] `GET $BASE/processos` sem auth → HTTP 401, body `{"message":"Autenticação indisponível",...}` (guard operacional)
- [ ] Tempo médio de resposta do `/health` após warm-up < 2s

### Executar

```bash
BASE=https://squad-ses-backend.onrender.com

# Pode levar até 30s na primeira chamada (Render Free dorme após 15min)
curl -w "\nHTTP %{http_code} em %{time_total}s\n" "$BASE/health"

curl -w "\nHTTP %{http_code}\n" "$BASE/"
curl -w "\nHTTP %{http_code}\n" "$BASE/docs" -o /dev/null -s
curl -w "\nHTTP %{http_code}\n" "$BASE/processos" -o /dev/null -s
```

### Critério de PASS

Todos os 7 itens acima. Qualquer 5xx reprova e exige abrir issue antes de prosseguir.

### Última execução

- **10/11/2026** — PASS ✅ (validado durante provisionamento Vercel, com backend já no ar sem PR aberto)

---

## Nível 2 — Smoke de dados / fluxo de autenticação

Valida que o frontend consegue autenticar no backend e trocar dados reais com o banco. **Depende** de pré-requisitos abaixo.

### Pré-requisitos (situação em 26/11/2026)

- [x] `POST /auth/login` e `POST /auth/refresh` (PR #30, 10/11)
- [x] CORS da API por `CORS_ORIGIN` (PR #73) + variável no Render — preflight de `https://squad-ses-frontend.vercel.app` responde 204 com `Access-Control-Allow-Origin` (conferido 26/11)
- [x] `trust proxy` (PR #73); falta validar o número de saltos no staging (Daily Tracker, saltos do proxy)
- [x] `VITE_API_URL=https://squad-ses-backend.onrender.com` no Vercel (Production/Preview/Development, desde 10/11)
- [x] Rewrite de SPA (`frontend/vercel.json`): sem ele, qualquer rota acessada direto (`/login`, `/assinar/<token>` dos e-mails, `/validar/<código>`) dá 404 da Vercel
- [ ] **Contas no staging:** seed (`npm run seed`, 2 contas) ou o script das contas do piloto rodado no Neon — sem isso, com o mock desligado ninguém entra
- [ ] `VITE_AUTH_MOCK=false` no Vercel (hoje `true`)
- [ ] **Deploy de produção atualizado:** o domínio `squad-ses-frontend.vercel.app` ainda serve o deploy manual de 10/11 (bundle com `localhost:3000` e login de demonstração). A `dev` só gera previews; a `main` está no commit inicial. Fazer `vercel --prod` a partir da `dev` (ou ligar a Production Branch à `dev`) depois dos dois itens acima

### Checklist

- [ ] `POST $BASE/auth/login` com credenciais válidas → HTTP 200 + `{accessToken, refreshToken, usuario}`
- [ ] `POST $BASE/auth/login` com credenciais inválidas → HTTP 401
- [ ] Preflight CORS: `OPTIONS $BASE/processos` com `Origin: https://squad-ses-frontend.vercel.app` → HTTP 204 + `Access-Control-Allow-Origin: https://squad-ses-frontend.vercel.app`
- [ ] Login no frontend em aba anônima → redireciona pro dashboard do perfil retornado
- [ ] `GET $BASE/processos` com `Authorization: Bearer <accessToken>` → HTTP 200 + lista (pode ser vazia)
- [ ] `POST $BASE/processos` com DTO válido + bearer → HTTP 201 + id retornado
- [ ] `GET $BASE/processos/{id}` do item recém-criado → HTTP 200 + mesmos dados
- [ ] Após `accessToken` expirar (ou simular 401): frontend chama `/auth/refresh` automaticamente e retoma a sessão sem logout
- [ ] Refresh inválido / expirado → frontend desloga e volta pra `/login`

### Critério de PASS

Todos os 9 itens. Se CORS ou refresh falharem, smoke reprova (regressão de UX crítica).

### Última execução

- **Pendente** — aguarda implementação dos pré-requisitos.

---

## Nível 3 — Smoke de upload / Backblaze B2

Valida que documentos anexados a um processo vão para o B2 e voltam por URL assinada. **Depende** do módulo de documentos consumir S3, escopo da **Sprint 2**.

### Pré-requisitos

- [ ] Nível 2 passando (precisa de auth real)
- [x] `POST /processos/:processoId/documentos` (upload) e `GET /processos/:processoId/documentos/:id/url` (URL assinada) — PRs #23/#45
- [x] Integração `@aws-sdk/client-s3` com o B2 + regra de CORS no bucket (Daily Tracker L32, 24/11)
- [ ] Bucket `ses-docs-staging-undb` com Application Key `ses-staging-backend` injetada no Render (`S3_*` vars do `.env.example`)

### Checklist

- [ ] Upload de PDF 1 MB via `POST /processos/:processoId/documentos` → HTTP 201 + id do documento
- [ ] Hash SHA-256 do arquivo retornado bate com o hash calculado localmente (integridade)
- [ ] `GET /processos/:processoId/documentos/:id/url` → HTTP 200 + URL assinada válida por tempo limitado
- [ ] Baixar pela URL assinada e comparar bytes — idênticos ao original
- [ ] Upload maior que limite configurado → HTTP 413 (nunca 500)
- [ ] Tentar baixar documento de outro processo (sem permissão) → HTTP 404 (comportamento intencional: não vaza existência do processo)
- [ ] Listar objetos no painel B2 (manual) — confirmar que o arquivo está lá, não ficou só no FS do Render

### Critério de PASS

Todos os 7 itens. Falha de integridade (hash divergente) é crítica — para a smoke.

### Última execução

- **Não aplicável** — Sprint 2 ainda não começou o módulo de upload.

---

## Rollback / plano se falhar na homologação

- **Frontend quebra**: reverter PR mais recente que mexeu em `frontend/` e redeploy automático via Vercel pega o commit anterior.
- **Backend quebra**: Render permite "Rollback to previous deploy" no painel sem rebuild.
- **DB quebra**: Neon tem branching por PR — restaurar branch anterior leva segundos.
- **Storage quebra**: B2 tem versionamento se habilitado no bucket — ver `S3_VERSIONING` no provisionamento.

## Referências

- [README_CI.md](../README_CI.md) — configuração de cada camada
- `backend/src/modules/auth/auth-temporario.guard.ts` — guard atual (blindado em produção)
- `backend/.env.example` — vars esperadas em cada camada
