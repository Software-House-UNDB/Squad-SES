// Teste de estresse HTTP dos comentários por documento (RF-12).
//
// Roda contra uma API de verdade com banco DESCARTÁVEL em UTF-8 (nunca o dev compartilhado):
//   STRESS_API=http://localhost:3999 \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ses_stress \
//   JWT_ACCESS_SECRET=<o mesmo da API, opcional: liga os ataques com JWT forjado> \
//   node backend/test/stress/comentarios.stress.mjs
// Usuários: os do seed (SEED_SENHA). Os documentos são inseridos direto no banco, então o
// teste não precisa de storage (MinIO/B2). Sai com código 1 se qualquer verificação falhar.
import { Client } from 'pg';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';

const API = process.env.STRESS_API ?? 'http://localhost:3999';
const SENHA = process.env.SEED_SENHA ?? 'Senha@2026';
const N_RAJADA = Number(process.env.STRESS_COMENTARIOS ?? 300);
const N_DOCUMENTOS_CORRIDA = Number(process.env.STRESS_CORRIDA_DOCUMENTOS ?? 40);
const N_PICO = Number(process.env.STRESS_PICO ?? 400);
const CONCORRENCIA = Number(process.env.STRESS_CONCORRENCIA ?? 25);

const falhas = [];
const latencias = [];
const checar = (ok, mensagem) => {
  console.log(`${ok ? '  ok ' : ' FALHA'}  ${mensagem}`);
  if (!ok) falhas.push(mensagem);
};
const contar = (lista) => lista.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});

async function chamar(metodo, caminho, { token, json, bruto, tipo } = {}) {
  const inicio = performance.now();
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(tipo ? { 'content-type': tipo } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : bruto,
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

const noDocumento = (processo, documento) =>
  `/processos/${processo}/documentos/${documento}/comentarios`;
const doProcesso = (processo) => `/processos/${processo}/comentarios`;
const comentar = (token, processo, documento, tipo, texto) =>
  chamar('POST', noDocumento(processo, documento), { token, json: { tipo, texto } });

try {
  // --- Preparação ---------------------------------------------------------------------------
  console.log('Preparação');
  const { rows: codificacao } = await banco.query('SHOW server_encoding');
  if (codificacao[0].server_encoding !== 'UTF8') {
    throw new Error(`O banco precisa ser UTF8 (como o do docker-compose), não ${codificacao[0].server_encoding}`);
  }
  const coord = await login('coordenacao@ses.ma.gov.br');
  const rep = await login('representante@undb.edu.br');
  const { rows: usuarios } = await banco.query(
    "SELECT id FROM usuarios WHERE email = 'representante@undb.edu.br'",
  );
  const repId = usuarios[0].id;
  // Segundo representante (mesma senha do seed), para os testes de isolamento.
  await banco.query(
    `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, instituicao, atualizado_em)
     SELECT gen_random_uuid(), 'Representante 2 (estresse)', 'rep2@undb.edu.br', senha_hash, perfil, instituicao, now()
       FROM usuarios WHERE email = 'representante@undb.edu.br'
     ON CONFLICT (email) DO NOTHING`,
  );
  const rep2 = await login('rep2@undb.edu.br');

  async function novoProcesso(status, token = rep) {
    const { status: http, corpo } = await chamar('POST', '/processos', { token, json: {} });
    if (http !== 201) throw new Error(`POST /processos: ${http}`);
    await banco.query('UPDATE processos SET status = $1::status_processo WHERE id = $2', [
      status,
      corpo.id,
    ]);
    return corpo.id;
  }
  async function novoDocumento(processo) {
    const { rows } = await banco.query(
      `INSERT INTO documentos (id, processo_id, tipo, nome_arquivo, mime_type, tamanho_bytes, hash_sha256, storage_key, enviado_por_id)
       VALUES (gen_random_uuid(), $1, 'anexo', 'estresse.pdf', 'application/pdf', 10, $2, $3, $4) RETURNING id`,
      [processo, randomBytes(32).toString('hex'), `estresse/${randomUUID()}.pdf`, repId],
    );
    return rows[0].id;
  }
  const contarComentarios = async (processo) =>
    (await banco.query('SELECT count(*)::int AS n FROM comentarios WHERE processo_id = $1', [processo]))
      .rows[0].n;
  const contarAuditoria = async (processo) =>
    (
      await banco.query(
        "SELECT count(*)::int AS n FROM auditoria WHERE acao = 'CREATE' AND entidade = 'comentario' AND dados_depois->>'processoId' = $1",
        [processo],
      )
    ).rows[0].n;

  // --- 1. Rajada de comentários concorrentes no mesmo documento ----------------------------------
  console.log(`\n1. ${N_RAJADA} comentários da coordenação no mesmo documento (${CONCORRENCIA} em voo)`);
  const procRajada = await novoProcesso('em_analise');
  const docRajada = await novoDocumento(procRajada);
  const tipos = ['pendencia', 'observacao'];
  const rajada = await emLotes(
    Array.from({ length: N_RAJADA }, (_, i) => () =>
      comentar(coord, procRajada, docRajada, tipos[i % 2], `comentário ${i}`),
    ),
    CONCORRENCIA,
  );
  const status1 = contar(rajada.map((r) => r.status));
  checar(status1[201] === N_RAJADA, `todos retornam 201 (obtido: ${JSON.stringify(status1)})`);
  checar(new Set(rajada.map((r) => r.corpo?.id)).size === N_RAJADA, 'cada resposta traz um id diferente');
  checar((await contarComentarios(procRajada)) === N_RAJADA, `${N_RAJADA} comentários gravados`);
  const aud1 = await contarAuditoria(procRajada);
  checar(aud1 === N_RAJADA, `auditoria: ${aud1} linhas CREATE/comentario (uma por comentário)`);
  const { rows: audTexto } = await banco.query(
    "SELECT count(*)::int AS n FROM auditoria WHERE entidade = 'comentario' AND dados_depois ? 'texto'",
  );
  checar(audTexto[0].n === 0, 'a auditoria não copia o texto dos comentários');

  // --- 2. Leituras concorrentes ------------------------------------------------------------------------
  console.log('\n2. 300 listagens concorrentes do documento e do processo');
  const listagens = await emLotes(
    Array.from({ length: 300 }, (_, i) => () =>
      i % 2 === 0
        ? chamar('GET', noDocumento(procRajada, docRajada), { token: i % 4 === 0 ? coord : rep })
        : chamar('GET', doProcesso(procRajada), { token: i % 4 === 1 ? coord : rep }),
    ),
    CONCORRENCIA,
  );
  checar(listagens.every((r) => r.status === 200), 'todas respondem 200');
  checar(listagens.every((r) => r.corpo.length === N_RAJADA), `todas veem os ${N_RAJADA} comentários`);
  const lista = listagens[0].corpo;
  checar(
    lista.every((c, i) => i === 0 || lista[i - 1].criadoEm <= c.criadoEm),
    'a lista vem em ordem cronológica',
  );
  checar(
    lista.every(
      (c) => JSON.stringify(Object.keys(c.autor).sort()) === '["id","nome","perfil"]' && !('autorId' in c),
    ),
    'o autor só expõe id, nome e perfil (sem e-mail nem hash de senha)',
  );
  checar(!JSON.stringify(listagens.map((r) => r.corpo)).includes('senha'), 'nenhuma listagem vaza "senha"');
  const lista2 = (await chamar('GET', noDocumento(procRajada, docRajada), { token: coord })).corpo;
  checar(JSON.stringify(lista2) === JSON.stringify(lista), 'duas leituras seguidas devolvem a mesma ordem');

  // --- 3. Matriz de permissões na API real ------------------------------------------------------------------
  console.log('\n3. Perfil × tipo × status do processo (tudo em paralelo)');
  const statuses = ['rascunho', 'enviado', 'em_analise', 'pendencia', 'aprovado', 'aguardando_assinaturas', 'concluido'];
  const casos = [];
  for (const status of statuses) {
    const proc = await novoProcesso(status);
    const doc = await novoDocumento(proc);
    const coordenacaoOk = ['enviado', 'em_analise', 'pendencia'].includes(status);
    const representanteOk = status === 'pendencia';
    const caso = (nome, esperado, token, tipo) => ({
      nome: `${nome} em ${status}`,
      esperado,
      chamada: () => comentar(token, proc, doc, tipo, 'x'),
    });
    casos.push(
      caso('coord pendencia', coordenacaoOk ? 201 : 409, coord, 'pendencia'),
      caso('coord observacao', coordenacaoOk ? 201 : 409, coord, 'observacao'),
      caso('coord resposta', 403, coord, 'resposta'),
      caso('rep resposta', representanteOk ? 201 : 409, rep, 'resposta'),
      caso('rep pendencia', 403, rep, 'pendencia'),
      caso('rep observacao', 403, rep, 'observacao'),
    );
  }
  const matriz = await Promise.all(casos.map((c) => c.chamada()));
  const erradas = casos
    .map((c, i) => ({ ...c, veio: matriz[i].status }))
    .filter((c) => c.veio !== c.esperado);
  checar(
    erradas.length === 0,
    `${casos.length - erradas.length}/${casos.length} células da matriz corretas` +
      (erradas.length ? ` — erradas: ${erradas.map((c) => `${c.nome} (esperado ${c.esperado}, veio ${c.veio})`).join('; ')}` : ''),
  );
  checar(
    matriz.filter((r) => r.status === 409).every((r) => r.corpo?.erro === 'status_invalido'),
    'todo 409 traz erro: "status_invalido"',
  );

  // --- 4. Isolamento e autenticação ------------------------------------------------------------------------------
  console.log('\n4. Isolamento e autenticação');
  const procA = await novoProcesso('pendencia', rep);
  const docA = await novoDocumento(procA);
  const procB = await novoProcesso('pendencia', rep2);
  const docB = await novoDocumento(procB);
  const alheio = await comentar(rep2, procA, docA, 'resposta', 'invasão');
  checar(alheio.status === 404, `outro representante não comenta no processo alheio: 404 (${alheio.status})`);
  const alheioLer = await chamar('GET', noDocumento(procA, docA), { token: rep2 });
  checar(alheioLer.status === 404, `outro representante não lê comentários alheios: 404 (${alheioLer.status})`);
  const alheioProc = await chamar('GET', doProcesso(procA), { token: rep2 });
  checar(alheioProc.status === 404, `nem a lista do processo alheio: 404 (${alheioProc.status})`);
  const cruzado = await comentar(coord, procA, docB, 'pendencia', 'documento de outro processo');
  checar(cruzado.status === 404, `documento de outro processo na rota: 404 (${cruzado.status})`);
  const cruzadoLer = await chamar('GET', noDocumento(procA, docB), { token: coord });
  checar(cruzadoLer.status === 404, `listar documento de outro processo: 404 (${cruzadoLer.status})`);
  const inexistente = await comentar(coord, procA, randomUUID(), 'pendencia', 'x');
  checar(inexistente.status === 404, `documento inexistente: 404 (${inexistente.status})`);
  const procInexistente = await comentar(coord, randomUUID(), docA, 'pendencia', 'x');
  checar(procInexistente.status === 404, `processo inexistente: 404 (${procInexistente.status})`);
  checar((await contarComentarios(procA)) === 0, 'nenhuma dessas tentativas gravou comentário');
  const ok = await comentar(rep, procA, docA, 'resposta', 'o dono responde');
  checar(ok.status === 201 && ok.corpo.autor.perfil === 'REPRESENTANTE_UNDB', 'o dono do processo responde normalmente');
  const daCoordenacao = await comentar(coord, procA, docA, 'pendencia', 'a coordenação enxerga o processo de qualquer representante');
  checar(daCoordenacao.status === 201, 'a coordenação comenta em processo de qualquer representante');
  const autorForjado = await chamar('POST', noDocumento(procA, docA), {
    token: coord,
    json: { tipo: 'pendencia', texto: 'x', autorId: repId },
  });
  checar(autorForjado.status === 400, `autorId no corpo é recusado (${autorForjado.status})`);
  const semBearer = await chamar('GET', doProcesso(procA));
  checar(semBearer.status === 401, `sem token: 401 (${semBearer.status})`);
  const lixo = await chamar('GET', doProcesso(procA), { token: 'a.b.c' });
  checar(lixo.status === 401, `token inválido: 401 (${lixo.status})`);
  const minusculo = await fetch(`${API}${doProcesso(procA)}`, { headers: { authorization: `bearer ${coord}` } });
  checar(minusculo.status === 401, `esquema "bearer" em minúsculas: 401 (${minusculo.status})`);

  // Ataques com JWT forjado (precisa do segredo do ambiente de teste).
  if (process.env.JWT_ACCESS_SECRET) {
    const b64 = (valor) => Buffer.from(typeof valor === 'string' ? valor : JSON.stringify(valor)).toString('base64url');
    const jwt = (payload, segredo = process.env.JWT_ACCESS_SECRET) => {
      const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
      return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`;
    };
    const agora = Math.floor(Date.now() / 1000);
    const fantasma = jwt({ sub: randomUUID(), perfil: 'COORDENACAO_SES', iat: agora, exp: agora + 300 });
    const rFantasma = await comentar(fantasma, procA, docA, 'pendencia', 'de um usuário que não existe mais');
    checar(rFantasma.status === 401, `token válido de usuário inexistente: 401, não 404/500 (${rFantasma.status})`);
    const expirado = jwt({ sub: repId, perfil: 'COORDENACAO_SES', iat: agora - 600, exp: agora - 300 });
    checar((await comentar(expirado, procA, docA, 'pendencia', 'x')).status === 401, 'token expirado: 401');
    const segredoErrado = jwt({ sub: repId, perfil: 'COORDENACAO_SES', iat: agora, exp: agora + 300 }, 'outro-segredo');
    checar((await comentar(segredoErrado, procA, docA, 'pendencia', 'x')).status === 401, 'token assinado com outro segredo: 401');
    const semAlgoritmo = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: repId, perfil: 'COORDENACAO_SES' })}.`;
    checar((await comentar(semAlgoritmo, procA, docA, 'pendencia', 'x')).status === 401, 'token com alg "none": 401');
    const comoRep = jwt({ sub: repId, perfil: 'REPRESENTANTE_UNDB', iat: agora, exp: agora + 300 });
    checar((await comentar(comoRep, procA, docA, 'pendencia', 'x')).status === 403, 'representante não escreve pendência mesmo com token legítimo: 403');
    checar((await contarComentarios(procA)) === 2, 'nenhum ataque de autenticação gravou comentário');
  } else {
    console.log('      (JWT_ACCESS_SECRET ausente: ataques com JWT forjado ignorados)');
  }

  // --- 5. Corrida: comentar enquanto o representante apaga o mesmo documento -----------------------------------
  console.log(`\n5. Corrida: ${N_DOCUMENTOS_CORRIDA} documentos apagados enquanto a coordenação comenta neles`);
  const procCorrida = await novoProcesso('pendencia');
  const docsCorrida = [];
  for (let i = 0; i < N_DOCUMENTOS_CORRIDA; i++) docsCorrida.push(await novoDocumento(procCorrida));
  // Cada requisição sai com um atraso aleatório: sem ele o DELETE (que faz menos consultas)
  // sempre ganhava, e a corrida nunca acontecia no outro sentido.
  const depoisDe = (ms, chamada) => esperar(Math.floor(Math.random() * ms)).then(chamada);
  const disputa = await Promise.all(
    docsCorrida.flatMap((doc) => [
      depoisDe(60, () => chamar('DELETE', `/processos/${procCorrida}/documentos/${doc}`, { token: rep })),
      depoisDe(60, () => comentar(coord, procCorrida, doc, 'pendencia', 'a')),
      depoisDe(60, () => comentar(coord, procCorrida, doc, 'observacao', 'b')),
      depoisDe(60, () => comentar(coord, procCorrida, doc, 'pendencia', 'c')),
    ]),
  );
  const apagados = disputa.filter((_, i) => i % 4 === 0);
  const comentariosDisputa = disputa.filter((_, i) => i % 4 !== 0);
  const statusApagar = contar(apagados.map((r) => r.status));
  const statusComentar = contar(comentariosDisputa.map((r) => r.status));
  checar(statusApagar[204] === N_DOCUMENTOS_CORRIDA, `todas as exclusões respondem 204 (${JSON.stringify(statusApagar)})`);
  checar(
    Object.keys(statusComentar).every((s) => s === '201' || s === '404'),
    `comentários concorrentes só dão 201 ou 404, nunca 5xx (${JSON.stringify(statusComentar)})`,
  );
  const criados = comentariosDisputa.filter((r) => r.status === 201).length;
  console.log(`      (a corrida deu ${criados} comentários criados e ${comentariosDisputa.length - criados} recusados com 404)`);
  checar(
    criados > 0 && criados < comentariosDisputa.length,
    'a corrida aconteceu nos dois sentidos (houve comentário que ganhou e que perdeu para a exclusão)',
  );
  checar((await contarComentarios(procCorrida)) === criados, `cada 201 virou uma linha (${criados}) e nenhum 404 gravou`);
  const { rows: restantes } = await banco.query('SELECT count(*)::int AS n FROM documentos WHERE processo_id = $1', [procCorrida]);
  checar(restantes[0].n === 0, 'todos os documentos foram removidos');
  const { rows: orfaos } = await banco.query(
    'SELECT count(*)::int AS n FROM comentarios WHERE processo_id = $1 AND documento_id IS NOT NULL',
    [procCorrida],
  );
  checar(orfaos[0].n === 0, 'sem documento, o comentário fica com documento_id nulo (histórico do processo)');
  const doProc = await chamar('GET', doProcesso(procCorrida), { token: coord });
  checar(doProc.status === 200 && doProc.corpo.length === criados, 'a lista do processo ainda mostra os comentários de documentos removidos');
  const audCorrida = await contarAuditoria(procCorrida);
  checar(audCorrida === criados, `auditoria bate com os comentários criados (${audCorrida})`);

  // Determinístico: o documento é apagado (ainda sem commit) no instante do insert do comentário.
  // O insert tem que esperar a FK e, depois do commit, recusar com 404 (P2003), nunca com 500.
  console.log('\n5b. Exclusão do documento ainda não confirmada no instante do insert');
  const procFk = await novoProcesso('pendencia');
  const docFk = await novoDocumento(procFk);
  const apagando = new Client({ connectionString: process.env.DATABASE_URL });
  await apagando.connect();
  await apagando.query('BEGIN');
  await apagando.query('DELETE FROM documentos WHERE id = $1', [docFk]);
  let acabou = false;
  const emVoo = comentar(coord, procFk, docFk, 'pendencia', 'chegou durante a exclusão').then((r) => {
    acabou = true;
    return r;
  });
  await esperar(500);
  checar(!acabou, 'o insert fica esperando a exclusão do documento (FK)');
  await apagando.query('COMMIT');
  await apagando.end();
  const aposExclusao = await emVoo;
  checar(
    aposExclusao.status === 404 && aposExclusao.corpo?.message === 'Documento não encontrado',
    `depois do commit: 404 "Documento não encontrado" (${aposExclusao.status})`,
  );
  checar((await contarComentarios(procFk)) === 0, 'nada foi gravado');
  checar((await contarAuditoria(procFk)) === 0, 'a auditoria também foi desfeita (mesma transação)');

  // --- 6. Troca de status em andamento (lock) -------------------------------------------------------------------
  console.log('\n6. Comentário durante uma troca de status ainda não confirmada');
  const procTroca = await novoProcesso('em_analise');
  const docTroca = await novoDocumento(procTroca);
  const trava = new Client({ connectionString: process.env.DATABASE_URL });
  await trava.connect();
  await trava.query('BEGIN');
  await trava.query("UPDATE processos SET status = 'aprovado'::status_processo WHERE id = $1", [procTroca]);
  let terminou = false;
  const durante = comentar(coord, procTroca, docTroca, 'pendencia', 'chegou durante a aprovação').then((r) => {
    terminou = true;
    return r;
  });
  await esperar(500);
  checar(!terminou, 'o comentário espera a troca de status terminar (não lê o status antigo)');
  await trava.query('COMMIT');
  await trava.end();
  const depoisDaTroca = await durante;
  checar(
    depoisDaTroca.status === 409 && depoisDaTroca.corpo?.erro === 'status_invalido',
    `depois do commit o comentário é recusado com 409 (${depoisDaTroca.status})`,
  );
  checar((await contarComentarios(procTroca)) === 0, 'nada foi gravado em processo já aprovado');
  // Comentários simultâneos não se bloqueiam entre si (o lock é compartilhado).
  const procParalelo = await novoProcesso('em_analise');
  const docParalelo = await novoDocumento(procParalelo);
  const t0 = performance.now();
  const paralelos = await Promise.all(
    Array.from({ length: 50 }, (_, i) => comentar(coord, procParalelo, docParalelo, 'observacao', `p${i}`)),
  );
  checar(paralelos.every((r) => r.status === 201), `50 comentários simultâneos: todos 201 (${(performance.now() - t0).toFixed(0)} ms)`);

  // Pico: mais requisições simultâneas que conexões no pool (10). Sem a espera maior pelo pool,
  // o Prisma desistia em 2 s (P2028) e a API devolvia 500 para dezenas delas.
  console.log(`\n6b. Pico de ${N_PICO} comentários simultâneos (mais que as conexões do pool)`);
  const procPico = await novoProcesso('em_analise');
  const docPico = await novoDocumento(procPico);
  const pico = await Promise.all(
    Array.from({ length: N_PICO }, (_, i) =>
      comentar(coord, procPico, docPico, 'observacao', `pico ${i}`).catch(() => ({ status: 'rede' })),
    ),
  );
  const statusPico = contar(pico.map((r) => r.status));
  // 'rede' = o SO recusou a conexão TCP do lado do cliente (fila de accept); não é resposta da API.
  checar(
    Object.keys(statusPico).every((s) => s === '201' || s === 'rede' || s === '503'),
    `o pico só gera 201 (ou 503 explícito em sobrecarga), nunca 500 (${JSON.stringify(statusPico)})`,
  );
  const gravadosPico = await contarComentarios(procPico);
  checar(gravadosPico === (statusPico[201] ?? 0), `cada 201 virou exatamente uma linha (${gravadosPico})`);
  const audPico = await contarAuditoria(procPico);
  checar(audPico === gravadosPico, `a auditoria acompanha: ${audPico} linhas (nenhuma escrita parcial)`);

  // --- 7. Entradas hostis e casos de borda --------------------------------------------------------------------
  console.log('\n7. Entradas hostis e casos de borda');
  const procBorda = await novoProcesso('em_analise');
  const docBorda = await novoDocumento(procBorda);
  const url = noDocumento(procBorda, docBorda);
  const enviar = (texto, tipo = 'observacao') => chamar('POST', url, { token: coord, json: { tipo, texto } });
  const aceita = [
    ['1000 caracteres', 'a'.repeat(1000)],
    ['1000 emojis (conta caracteres: 2000 unidades UTF-16, 4000 bytes)', '😀'.repeat(1000)],
    ['500 "❤️" (coração + seletor de variação = 1000 caracteres)', '❤️'.repeat(500)],
    ['HTML/script (guardado como texto puro)', '<script>alert(1)</script><img src=x onerror=alert(1)>'],
    ['SQL injection (guardado como texto puro)', "'; DROP TABLE comentarios; --"],
    ['quebras de linha e tab no meio', 'linha 1\r\n\tlinha 2\nlinha 3'],
    ['acentos e combinações Unicode', 'Atenção: João, Conceição — ação ñ 한국어 العربية'],
    ['surrogate solitário', 'abc\ud800def'],
    ['%s e ${} e {{ }}', 'texto %s ${x} {{ y }} %(z)s'],
  ];
  for (const [nome, texto] of aceita) {
    const r = await enviar(texto);
    checar(r.status === 201, `aceita ${nome}: 201 (${r.status})`);
    if (r.status === 201 && !nome.includes('surrogate')) {
      checar(r.corpo.texto === texto, `  …e devolve exatamente o mesmo texto (${nome})`);
    }
  }
  const recusa = [
    ['byte nulo', 'abc\u0000def'],
    ['1001 caracteres', 'a'.repeat(1001)],
    ['1001 emojis', '😀'.repeat(1001)],
    // O validator.js desconta U+FE0F; o banco conta. Antes da correção isto dava 500.
    ['600 "a" + seletor de variação (1200 caracteres)', 'a️'.repeat(600)],
    ['só espaços', '      '],
    ['só zero-width', '​​​'],
    ['vazio', ''],
  ];
  for (const [nome, texto] of recusa) {
    const r = await enviar(texto);
    checar(r.status === 400, `recusa ${nome}: 400 (${r.status})`);
  }
  const cru = [
    ['JSON malformado', '{"tipo": "pendencia", "texto": ', 'application/json', 400],
    ['corpo vazio', '', 'application/json', 400],
    ['text/plain', '{"tipo":"pendencia","texto":"x"}', 'text/plain', 400],
    ['array no lugar do objeto', '[{"tipo":"pendencia","texto":"x"}]', 'application/json', 400],
    ['__proto__ no corpo', '{"tipo":"observacao","texto":"x","__proto__":{"admin":true}}', 'application/json', null],
    ['corpo de 300 KB', JSON.stringify({ tipo: 'observacao', texto: 'a'.repeat(300_000) }), 'application/json', 413],
    ['tipo como array', '{"tipo":["pendencia"],"texto":"x"}', 'application/json', 400],
    ['texto como objeto (NoSQL-style)', '{"tipo":"pendencia","texto":{"$ne":""}}', 'application/json', 400],
  ];
  for (const [nome, corpo, tipo, esperado] of cru) {
    const r = await chamar('POST', url, { token: coord, bruto: corpo, tipo });
    checar(
      esperado ? r.status === esperado : r.status < 500,
      `${nome}: ${esperado ?? 'qualquer 4xx/2xx, sem 5xx'} (${r.status})`,
    );
  }
  const metodos = await Promise.all(
    ['PUT', 'PATCH', 'DELETE'].map((m) => chamar(m, `${url}/${randomUUID()}`, { token: coord, json: { texto: 'x' } })),
  );
  checar(metodos.every((r) => r.status === 404), 'PUT/PATCH/DELETE em comentário: 404 (comentário é imutável)');
  for (const caminho of [
    '/processos/abc/comentarios',
    `/processos/${procBorda}/documentos/123/comentarios`,
    `/processos/${procBorda}'%20OR%201%3D1--/comentarios`,
  ]) {
    const r = await chamar('GET', caminho, { token: coord });
    checar(r.status === 400, `UUID inválido na rota: 400 (${r.status}) ${caminho.slice(0, 50)}`);
  }
  const lido = await chamar('GET', url, { token: coord });
  const textos = new Set(lido.corpo.map((c) => c.texto));
  checar(textos.has("'; DROP TABLE comentarios; --"), 'o texto de SQL injection foi guardado literalmente');
  checar(textos.has('linha 1\r\n\tlinha 2\nlinha 3'), 'quebras de linha e tabs preservados na leitura');
  const aparado = await enviar('   com espaços nas pontas   \n');
  checar(aparado.corpo?.texto === 'com espaços nas pontas', 'espaços e quebras de linha nas pontas são removidos');

  // --- 8. O banco se protege sozinho ---------------------------------------------------------------------------------
  console.log('\n8. Integridade no banco (CHECK, FK, vínculos)');
  const tentaInserir = async (texto) => {
    try {
      await banco.query(
        "INSERT INTO comentarios (id, processo_id, documento_id, autor_id, tipo, texto) VALUES (gen_random_uuid(), $1, $2, $3, 'observacao', $4)",
        [procBorda, docBorda, repId, texto],
      );
      return 'aceitou';
    } catch (erro) {
      return erro.code;
    }
  };
  checar((await tentaInserir('   ')) === '23514', 'CHECK recusa texto só com espaços direto no banco (23514)');
  checar((await tentaInserir('a'.repeat(1001))) === '23514', 'CHECK recusa 1001 caracteres direto no banco (23514)');
  checar((await tentaInserir('')) === '23514', 'CHECK recusa texto vazio direto no banco (23514)');
  const semDoc = await banco.query(
    "INSERT INTO comentarios (id, processo_id, documento_id, autor_id, tipo, texto) VALUES (gen_random_uuid(), $1, NULL, $2, 'observacao', 'sem documento') RETURNING id",
    [procBorda, repId],
  );
  checar(semDoc.rowCount === 1, 'documento_id nulo é aceito (documento é opcional no modelo do projeto)');
  let fkProcesso;
  try {
    await banco.query(
      "INSERT INTO comentarios (id, processo_id, autor_id, tipo, texto) VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'observacao', 'x')",
      [repId],
    );
  } catch (erro) {
    fkProcesso = erro.code;
  }
  checar(fkProcesso === '23503', 'FK recusa processo inexistente (23503)');
  const { rows: cruzados } = await banco.query(
    'SELECT count(*)::int AS n FROM comentarios c JOIN documentos d ON d.id = c.documento_id WHERE d.processo_id <> c.processo_id',
  );
  checar(cruzados[0].n === 0, 'nenhum comentário aponta para documento de outro processo');
  const { rows: perfilTipo } = await banco.query(
    `SELECT count(*)::int AS n FROM comentarios c JOIN usuarios u ON u.id = c.autor_id
      JOIN auditoria a ON a.entidade = 'comentario' AND a.entidade_id = c.id::text
      WHERE (c.tipo = 'resposta' AND u.perfil <> 'REPRESENTANTE_UNDB')
         OR (c.tipo <> 'resposta' AND u.perfil <> 'COORDENACAO_SES')`,
  );
  checar(perfilTipo[0].n === 0, 'todo comentário criado pela API tem o autor do perfil certo para o tipo');

  // --- 9. A API continua de pé --------------------------------------------------------------------------------------
  console.log('\n9. Saúde');
  const saude = await chamar('GET', '/health');
  checar(saude.status === 200, `GET /health continua respondendo (${saude.status})`);
  const relogin = await chamar('POST', '/auth/login', { json: { email: 'coordenacao@ses.ma.gov.br', senha: SENHA } });
  checar(relogin.status === 200, 'login continua funcionando depois do estresse');

  console.log(
    `\nLatência (${latencias.length} requisições): p50 ${percentil(latencias, 50).toFixed(0)} ms · p95 ${percentil(latencias, 95).toFixed(0)} ms · p99 ${percentil(latencias, 99).toFixed(0)} ms · máx ${Math.max(...latencias).toFixed(0)} ms`,
  );
} finally {
  await banco.end();
}

if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam:\n- ${falhas.join('\n- ')}`);
  process.exit(1);
}
console.log('\nTodas as verificações passaram.');
