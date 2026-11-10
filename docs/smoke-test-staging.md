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

### Pré-requisitos (bloqueio atual)

- [ ] `auth.controller.ts` com `POST /auth/login` implementado (hoje é só `class AuthController {}`) — responsável: **William** (Daily Tracker linha 22)
- [ ] `POST /auth/refresh` implementado
- [ ] CORS habilitado: `app.enableCors({ origin: 'https://squad-ses-frontend.vercel.app', credentials: true })` em `main.ts` (hoje headers `access-control-*` ausentes)
- [ ] `app.set('trust proxy', 1)` — necessário atrás do proxy do Render
- [ ] `VITE_API_URL=https://squad-ses-backend.onrender.com` no Vercel (configurado 10/11)
- [ ] `VITE_AUTH_MOCK=false` no Vercel + redeploy para pegar as duas vars

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
- [ ] `documentos.controller.ts` com `POST /processos/{id}/documentos` (upload) e `GET /documentos/{id}/url` (download via URL assinada) — Sprint 2
- [ ] Integração `@aws-sdk/client-s3` apontando pros endpoints do B2
- [ ] Bucket `ses-docs` com Application Key `ses-prod` injetada no Render (`S3_*` vars do `.env.example`)

### Checklist

- [ ] Upload de PDF 1 MB via `POST /processos/{id}/documentos` → HTTP 201 + id do documento
- [ ] Hash SHA-256 do arquivo retornado bate com o hash calculado localmente (integridade)
- [ ] `GET /documentos/{id}/url` → HTTP 200 + URL assinada válida por tempo limitado
- [ ] Baixar pela URL assinada e comparar bytes — idênticos ao original
- [ ] Upload maior que limite configurado → HTTP 413 (nunca 500)
- [ ] Tentar baixar documento de outro processo (sem permissão) → HTTP 403
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
