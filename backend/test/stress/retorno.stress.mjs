// Teste de estresse HTTP do retorno da coordenação (#24/#48) e da auditoria canônica (#49).
//
// Roda contra uma API de verdade com banco e bucket DESCARTÁVEIS (nunca o dev compartilhado):
//   STRESS_API=http://localhost:3999 \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ses_stress \
//   node backend/test/stress/retorno.stress.mjs
// Usuários: os do seed (SEED_SENHA). Sai com código 1 se qualquer verificação falhar.
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

const API = process.env.STRESS_API ?? 'http://localhost:3999';
const SENHA = process.env.SEED_SENHA ?? 'Senha@2026';
const N_UPLOADS = Number(process.env.STRESS_UPLOADS ?? 200);
const N_CORRIDA = Number(process.env.STRESS_CORRIDA ?? 40);
const CONCORRENCIA = Number(process.env.STRESS_CONCORRENCIA ?? 25);

const falhas = [];
const latencias = [];
const checar = (ok, mensagem) => {
  console.log(`${ok ? '  ok ' : ' FALHA'}  ${mensagem}`);
  if (!ok) falhas.push(mensagem);
};
const contar = (lista) => lista.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});

async function chamar(metodo, caminho, { token, json, form } = {}) {
  const inicio = performance.now();
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'content-type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : form,
  });
  latencias.push(performance.now() - inicio);
  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { status: resposta.status, corpo };
}

// Executa as tarefas com no máximo `limite` em voo, como um pico real de usuários.
async function emLotes(tarefas, limite) {
  const resultados = Array.from({ length: tarefas.length });
  let proxima = 0;
  await Promise.all(
    Array.from({ length: limite }, async () => {
      while (proxima < tarefas.length) {
        const i = proxima++;
        resultados[i] = await tarefas[i]();
      }
    }),
  );
  return resultados;
}

const pdfUnico = (rotulo) =>
  new Blob([Buffer.from(`%PDF-1.7\n% ${rotulo} ${randomBytes(12).toString('hex')}\n%%EOF`)], {
    type: 'application/pdf',
  });

function formDocumento(tipo, blob, nome = 'retorno.pdf') {
  const form = new FormData();
  form.append('tipo', tipo);
  form.append('arquivo', blob, nome);
  return form;
}

async function login(email) {
  const { status, corpo } = await chamar('POST', '/auth/login', { json: { email, senha: SENHA } });
  if (status !== 200) throw new Error(`login ${email}: ${status}`);
  return corpo.accessToken;
}

const percentil = (valores, p) => {
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))];
};

const banco = new Client({ connectionString: process.env.DATABASE_URL });
await banco.connect();

try {
  // --- Preparação ---------------------------------------------------------------------------
  console.log('Preparação');
  const logins = await Promise.all(
    Array.from({ length: 20 }, () => login('coordenacao@ses.ma.gov.br')),
  );
  checar(logins.length === 20 && logins.every(Boolean), '20 logins simultâneos (argon2) respondem 200');
  const coord = logins[0];
  const rep = await login('representante@undb.edu.br');

  async function novoProcesso(status) {
    const { status: http, corpo } = await chamar('POST', '/processos', { token: rep, json: {} });
    if (http !== 201) throw new Error(`POST /processos: ${http}`);
    await banco.query('UPDATE processos SET status = $1::status_processo WHERE id = $2', [status, corpo.id]);
    return corpo.id;
  }
  const aprovado = await novoProcesso('aprovado');

  // --- 1. Rajada de uploads distintos pela coordenação ------------------------------------------
  console.log(`\n1. ${N_UPLOADS} retornos distintos (${CONCORRENCIA} em voo)`);
  const tipos = ['oficio', 'oficio_alteracao', 'kit_estagio', 'anexo'];
  const respostas = await emLotes(
    Array.from({ length: N_UPLOADS }, (_, i) => () =>
      chamar('POST', `/processos/${aprovado}/documentos`, {
        token: coord,
        form: formDocumento(tipos[i % tipos.length], pdfUnico(`u${i}`), `retorno-${i}.pdf`),
      }),
    ),
    CONCORRENCIA,
  );
  const status1 = contar(respostas.map((r) => r.status));
  checar(status1[201] === N_UPLOADS, `todos retornam 201 (obtido: ${JSON.stringify(status1)})`);
  const { rows: docs1 } = await banco.query('SELECT count(*)::int AS n FROM documentos WHERE processo_id = $1', [aprovado]);
  checar(docs1[0].n === N_UPLOADS, `${docs1[0].n} documentos gravados (esperado ${N_UPLOADS})`);
  const { rows: aud1 } = await banco.query(
    "SELECT acao, count(*)::int AS n FROM auditoria WHERE entidade = 'documento' AND dados_depois->>'processoId' = $1 GROUP BY acao",
    [aprovado],
  );
  const porAcao = Object.fromEntries(aud1.map((r) => [r.acao, r.n]));
  checar(porAcao.RETORNO_COORDENACAO === N_UPLOADS, `auditoria: ${porAcao.RETORNO_COORDENACAO} linhas RETORNO_COORDENACAO`);
  checar(!porAcao.CREATE, 'nenhum retorno da coordenação foi auditado como CREATE genérico');

  // --- 2. Corrida: o mesmo arquivo enviado N vezes ao mesmo tempo -------------------------------------
  console.log(`\n2. Corrida: o mesmo PDF ${N_CORRIDA}x ao mesmo tempo`);
  const repetido = pdfUnico('corrida');
  const corrida = await Promise.all(
    Array.from({ length: N_CORRIDA }, () =>
      chamar('POST', `/processos/${aprovado}/documentos`, {
        token: coord,
        form: formDocumento('oficio', repetido, 'corrida.pdf'),
      }),
    ),
  );
  const status2 = contar(corrida.map((r) => r.status));
  checar(status2[201] === 1, `exatamente 1 envio aceito (obtido: ${JSON.stringify(status2)})`);
  checar(Object.keys(status2).every((s) => s === '201' || s === '409'), 'o resto é 409, sem 5xx');

  // --- 3. Permissões e status sob carga -------------------------------------------------------------------
  console.log('\n3. Permissões e status (misturados, em paralelo)');
  const emAnalise = await novoProcesso('em_analise');
  const concluido = await novoProcesso('concluido');
  const misto = await Promise.all([
    ...Array.from({ length: 30 }, () =>
      chamar('POST', `/processos/${aprovado}/documentos`, { token: coord, form: formDocumento('termo_compromisso', pdfUnico('tce')) }),
    ),
    ...Array.from({ length: 30 }, () =>
      chamar('POST', `/processos/${emAnalise}/documentos`, { token: coord, form: formDocumento('oficio', pdfUnico('ea')) }),
    ),
    ...Array.from({ length: 30 }, () =>
      chamar('POST', `/processos/${concluido}/documentos`, { token: coord, form: formDocumento('oficio', pdfUnico('c')) }),
    ),
    ...Array.from({ length: 30 }, () =>
      chamar('POST', `/processos/${aprovado}/documentos`, { token: rep, form: formDocumento('oficio', pdfUnico('rep')) }),
    ),
  ]);
  const [tce, analise, fechado, repRetorno] = [0, 1, 2, 3].map((i) => contar(misto.slice(i * 30, i * 30 + 30).map((r) => r.status)));
  checar(tce[403] === 30, `TCE pela coordenação: 30x 403 (${JSON.stringify(tce)})`);
  checar(analise[409] === 30, `retorno em em_analise: 30x 409 (${JSON.stringify(analise)})`);
  checar(fechado[409] === 30, `retorno em concluido: 30x 409 (${JSON.stringify(fechado)})`);
  checar(repRetorno[409] === 30 || repRetorno[403] === 30, `representante em aprovado é recusado (${JSON.stringify(repRetorno)})`);

  // --- 4. Leituras concorrentes ----------------------------------------------------------------------------
  console.log('\n4. 300 listagens concorrentes');
  const listagens = await emLotes(
    Array.from({ length: 300 }, () => () => chamar('GET', `/processos/${aprovado}/documentos`, { token: coord })),
    CONCORRENCIA,
  );
  checar(listagens.every((r) => r.status === 200), 'todas respondem 200');
  checar(listagens.every((r) => r.corpo.length === N_UPLOADS + 1), `todas veem os ${N_UPLOADS + 1} documentos`);
  checar(listagens.every((r) => r.corpo.every((d) => !('storageKey' in d))), 'nenhuma vaza storageKey');

  // --- 5. Exclusões concorrentes do mesmo documento ------------------------------------------------------------
  console.log('\n5. 20 exclusões do mesmo retorno ao mesmo tempo, mais exclusão do pacote da UNDB');
  const alvo = listagens[0].corpo[0].id;
  const exclusoes = await Promise.all(
    Array.from({ length: 20 }, () => chamar('DELETE', `/processos/${aprovado}/documentos/${alvo}`, { token: coord })),
  );
  const status5 = contar(exclusoes.map((r) => r.status));
  checar(status5[204] === 1, `exatamente 1 exclusão efetiva (${JSON.stringify(status5)})`);
  checar(!Object.keys(status5).some((s) => Number(s) >= 500), 'nenhuma exclusão concorrente gera 5xx');
  const { rows: aud5 } = await banco.query("SELECT count(*)::int AS n FROM auditoria WHERE acao = 'DELETE' AND entidade_id = $1", [alvo]);
  checar(aud5[0].n === 1, `auditoria DELETE gravada 1 vez (${aud5[0].n})`);

  // coordenação não remove o pacote da UNDB; representante não remove o retorno da SES
  const docUndb = await (async () => {
    const proc = await novoProcesso('rascunho');
    const { corpo } = await chamar('POST', `/processos/${proc}/documentos`, {
      token: rep,
      form: formDocumento('plano_atividades', pdfUnico('plano')),
    });
    await banco.query("UPDATE processos SET status = 'aprovado'::status_processo WHERE id = $1", [proc]);
    return { proc, id: corpo.id };
  })();
  const cruzada = await chamar('DELETE', `/processos/${docUndb.proc}/documentos/${docUndb.id}`, { token: coord });
  checar(cruzada.status === 403, `coordenação removendo pacote da UNDB: 403 (${cruzada.status})`);
  const outroRetorno = listagens[0].corpo[1].id;
  const cruzada2 = await chamar('DELETE', `/processos/${aprovado}/documentos/${outroRetorno}`, { token: rep });
  checar([403, 409].includes(cruzada2.status), `representante removendo retorno da SES é recusado (${cruzada2.status})`);

  // --- 6. Análise concorrente (ação ANALISE) -----------------------------------------------------------------------
  console.log('\n6. 60 PATCH /analise concorrentes');
  const analisavel = await novoProcesso('em_analise');
  const analises = await emLotes(
    Array.from({ length: 60 }, (_, i) => () =>
      chamar('PATCH', `/processos/${analisavel}/analise`, { token: coord, json: { observacaoAnalise: `nota ${i}` } }),
    ),
    CONCORRENCIA,
  );
  const status6 = contar(analises.map((r) => r.status));
  checar(status6[200] === 60, `todos 200 (${JSON.stringify(status6)})`);
  const { rows: aud6 } = await banco.query("SELECT acao, count(*)::int AS n FROM auditoria WHERE entidade = 'processo' AND entidade_id = $1 GROUP BY acao", [analisavel]);
  const acoes6 = Object.fromEntries(aud6.map((r) => [r.acao, r.n]));
  checar(acoes6.ANALISE === 60 && !acoes6.UPDATE, `auditoria: 60x ANALISE, 0x UPDATE (${JSON.stringify(acoes6)})`);

  // --- 7. Integridade global ---------------------------------------------------------------------------------------
  console.log('\n7. Integridade');
  const { rows: orfaos } = await banco.query('SELECT count(*)::int AS n FROM documentos d LEFT JOIN processos p ON p.id = d.processo_id WHERE p.id IS NULL');
  checar(orfaos[0].n === 0, 'nenhum documento órfão');
  const { rows: dupes } = await banco.query('SELECT count(*)::int AS n FROM (SELECT 1 FROM documentos GROUP BY processo_id, hash_sha256 HAVING count(*) > 1) t');
  checar(dupes[0].n === 0, 'nenhum (processo, hash) duplicado');
  const saude = await chamar('POST', '/auth/login', { json: { email: 'coordenacao@ses.ma.gov.br', senha: SENHA } });
  checar(saude.status === 200, 'a API continua respondendo depois do estresse');

  console.log(
    `\nLatência (${latencias.length} requisições): p50 ${percentil(latencias, 50).toFixed(0)} ms · p95 ${percentil(latencias, 95).toFixed(0)} ms · máx ${Math.max(...latencias).toFixed(0)} ms`,
  );
} finally {
  await banco.end();
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam:\n- ${falhas.join('\n- ')}`);
  process.exit(1);
}
console.log('\nTodas as verificações passaram.');
