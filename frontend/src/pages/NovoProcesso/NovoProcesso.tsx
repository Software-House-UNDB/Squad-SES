import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  CircleAlert,
  CircleCheck,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  Loader2,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import Badge from '../../components/ui/Badge.tsx';
import IconButton from '../../components/ui/IconButton.tsx';
import Toast from '../../components/ui/Toast.tsx';
import { enviarProcesso } from '../../services/processoService.ts';
import ArquivoSlot, { type Arquivo } from './ArquivoSlot.tsx';
import { DOCS_DO_PROCESSO, docsDoEstagiario, exigidos, pendenciasDoPacote, validarArquivo } from './pacote.ts';
import {
  ESTAGIARIO_VAZIO,
  formatarCpf,
  validarEstagiario,
  type ErrosEstagiario,
  type EstagiarioForm,
} from './validacao.ts';
import './novoProcesso.css';

type Envio = 'editando' | 'enviando' | 'enviado';

interface ToastState {
  variant: 'approved' | 'rejected';
  title: string;
  message: string;
  undo?: () => void;
}

const PENDENCIAS_VISIVEIS = 4;

/** Tela "Novo processo de documentação" do representante da IES (RF-06, RF-08, RF-09, RF-10, RF-13). */
export default function NovoProcesso() {
  const [estagiarios, setEstagiarios] = useState<EstagiarioForm[]>([]);
  const [rascunho, setRascunho] = useState<EstagiarioForm>(ESTAGIARIO_VAZIO);
  const [erros, setErros] = useState<ErrosEstagiario>({});
  const [anexos, setAnexos] = useState<Record<string, Arquivo>>({});
  const [errosArquivo, setErrosArquivo] = useState<Record<string, string>>({});
  const [envio, setEnvio] = useState<Envio>('editando');
  const [erroEnvio, setErroEnvio] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const uid = useId();
  const nomeRef = useRef<HTMLInputElement>(null);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const id = (nome: string) => `${uid}-${nome}`;
  const fecharToast = useCallback(() => setToast(null), []);

  const anexados = new Set(Object.keys(anexos));
  const todos = exigidos(estagiarios);
  const pendencias = pendenciasDoPacote(estagiarios, anexados);
  const completos = todos.filter((d) => anexados.has(d.chave)).length;
  const podeEnviar = pendencias.length === 0 && envio === 'editando';

  function campo<K extends keyof EstagiarioForm>(chave: K, valor: EstagiarioForm[K]) {
    setRascunho((atual) => ({ ...atual, [chave]: valor }));
    if (erros[chave]) setErros((atual) => ({ ...atual, [chave]: undefined }));
  }

  function adicionarEstagiario(e: FormEvent) {
    e.preventDefault();
    const encontrados = validarEstagiario(rascunho, estagiarios);
    setErros(encontrados);
    const primeiroErro = Object.keys(encontrados)[0];
    if (primeiroErro) {
      document.getElementById(id(primeiroErro))?.focus();
      return;
    }
    setEstagiarios((lista) => [...lista, rascunho]);
    setRascunho(ESTAGIARIO_VAZIO);
    nomeRef.current?.focus();
  }

  function removerEstagiario(indice: number) {
    const removido = estagiarios[indice];
    const doEstagiario = Object.fromEntries(
      Object.entries(anexos).filter(([chave]) => chave.startsWith(`${removido.cpf}|`)),
    );
    setEstagiarios((lista) => lista.filter((_, i) => i !== indice));
    setAnexos((atual) =>
      Object.fromEntries(Object.entries(atual).filter(([chave]) => !(chave in doEstagiario))),
    );
    setToast({
      variant: 'rejected',
      title: 'Estagiário removido',
      message: `${removido.nome} saiu do lote, junto com os documentos anexados a ele.`,
      undo: () => {
        setEstagiarios((lista) => {
          const copia = [...lista];
          copia.splice(Math.min(indice, copia.length), 0, removido);
          return copia;
        });
        setAnexos((atual) => ({ ...atual, ...doEstagiario }));
      },
    });
  }

  function anexar(chave: string, arquivo: File) {
    const problema = validarArquivo(arquivo);
    setErrosArquivo((atual) => {
      const { [chave]: _antigo, ...resto } = atual;
      return problema ? { ...resto, [chave]: problema } : resto;
    });
    if (!problema) setAnexos((atual) => ({ ...atual, [chave]: { nome: arquivo.name, tamanho: arquivo.size } }));
  }

  function remover(chave: string) {
    setAnexos((atual) => {
      const { [chave]: _removido, ...resto } = atual;
      return resto;
    });
  }

  async function enviar() {
    if (!podeEnviar) return;
    setErroEnvio(false);
    setEnvio('enviando');
    try {
      await enviarProcesso();
      if (montado.current) setEnvio('enviado');
    } catch {
      if (!montado.current) return;
      setEnvio('editando');
      setErroEnvio(true);
    }
  }

  function salvarRascunho() {
    setToast({
      variant: 'approved',
      title: 'Rascunho salvo',
      message: 'O processo continua como rascunho. Você pode retomar de onde parou.',
    });
  }

  function novoProcesso() {
    setEstagiarios([]);
    setRascunho(ESTAGIARIO_VAZIO);
    setErros({});
    setAnexos({});
    setErrosArquivo({});
    setErroEnvio(false);
    setEnvio('editando');
  }

  const erro = (chave: keyof EstagiarioForm) =>
    erros[chave] ? (
      <span className="np-error" id={id(`${chave}-erro`)} role="alert">
        {erros[chave]}
      </span>
    ) : null;
  const aria = (chave: keyof EstagiarioForm) => ({
    id: id(chave),
    'aria-invalid': erros[chave] ? true : undefined,
    'aria-describedby': erros[chave] ? id(`${chave}-erro`) : undefined,
  });

  if (envio === 'enviado') {
    return (
      <>
        <PageHeader
          icon={FilePlus2}
          title="Novo processo de documentação"
          breadcrumb={['Gerenciamento', 'Novo processo']}
        />
        <section className="np-card np-sucesso" aria-live="polite">
          <span className="np-sucesso__icone">
            <CircleCheck size={28} />
          </span>
          <h2 className="np-sucesso__titulo">Processo enviado</h2>
          <p className="np-sucesso__texto">
            O status agora é <Badge variant="pending">Enviado</Badge>. A coordenação da SES foi
            avisada por e-mail e vai começar a análise.
          </p>
          <p className="np-sucesso__texto np-sucesso__texto--suave">
            {estagiarios.length} estagiário(s) · {todos.length} documento(s) no pacote. O TCE será
            gerado pelo sistema quando a coordenação aprovar.
          </p>
          <button type="button" className="np-btn np-btn--primary" onClick={novoProcesso}>
            Criar outro processo
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={FilePlus2}
        title="Novo processo de documentação"
        breadcrumb={['Gerenciamento', 'Novo processo']}
      />

      <div className="np-layout">
        <div className="np-main">
          <section className="np-card" aria-labelledby={id('est-titulo')}>
            <header className="np-card__head">
              <span className="np-card__icon">
                <Users size={18} />
              </span>
              <div>
                <h2 className="np-card__title" id={id('est-titulo')}>
                  Estagiários do lote
                </h2>
                <p className="np-card__hint">
                  Adicione um por vez. Todos os campos são obrigatórios.
                </p>
              </div>
              <Badge variant={estagiarios.length ? 'approved' : 'neutral'}>
                {estagiarios.length} no lote
              </Badge>
            </header>

            <form className="np-form" onSubmit={adicionarEstagiario} noValidate>
              <div className="np-grid">
                <div className="np-field np-span-2">
                  <label htmlFor={id('nome')}>Nome completo</label>
                  <input
                    {...aria('nome')}
                    ref={nomeRef}
                    value={rascunho.nome}
                    onChange={(e) => campo('nome', e.target.value)}
                    autoComplete="off"
                  />
                  {erro('nome')}
                </div>
                <div className="np-field">
                  <label htmlFor={id('cpf')}>CPF</label>
                  <input
                    {...aria('cpf')}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={rascunho.cpf}
                    onChange={(e) => campo('cpf', formatarCpf(e.target.value))}
                  />
                  {erro('cpf')}
                </div>
                <div className="np-field">
                  <label htmlFor={id('matricula')}>Matrícula</label>
                  <input
                    {...aria('matricula')}
                    value={rascunho.matricula}
                    onChange={(e) => campo('matricula', e.target.value)}
                  />
                  {erro('matricula')}
                </div>
                <div className="np-field np-span-2">
                  <label htmlFor={id('curso')}>Curso</label>
                  <input
                    {...aria('curso')}
                    value={rascunho.curso}
                    onChange={(e) => campo('curso', e.target.value)}
                  />
                  {erro('curso')}
                </div>
                <label className="np-check-menor np-span-2">
                  <input
                    type="checkbox"
                    checked={rascunho.menor}
                    onChange={(e) => {
                      campo('menor', e.target.checked);
                      if (!e.target.checked) campo('responsavel', '');
                    }}
                  />
                  <span>
                    <strong>Estagiário menor de idade</strong>
                    <small>Exige identidade e declaração do responsável no pacote.</small>
                  </span>
                </label>
                {rascunho.menor && (
                  <div className="np-field np-span-2">
                    <label htmlFor={id('responsavel')}>Nome do responsável</label>
                    <input
                      {...aria('responsavel')}
                      value={rascunho.responsavel}
                      onChange={(e) => campo('responsavel', e.target.value)}
                      autoComplete="off"
                    />
                    {erro('responsavel')}
                  </div>
                )}
              </div>

              <div className="np-form__actions">
                <button type="submit" className="np-btn np-btn--secondary">
                  <UserPlus size={16} />
                  Adicionar ao lote
                </button>
              </div>
            </form>

            {estagiarios.length > 0 && (
              <ul className="np-lista" aria-label="Estagiários do lote">
                {estagiarios.map((e, i) => (
                  <li key={e.cpf} className="np-aluno">
                    <span className="np-aluno__avatar" aria-hidden="true">
                      {e.nome.trim()[0]?.toUpperCase()}
                    </span>
                    <div className="np-aluno__info">
                      <p className="np-aluno__nome">
                        {e.nome}
                        {e.menor && <Badge variant="pending">Menor de idade</Badge>}
                      </p>
                      <p className="np-aluno__detalhe">
                        {e.curso} · Mat. {e.matricula} · CPF {e.cpf}
                        {e.menor ? ` · Responsável: ${e.responsavel}` : ''}
                      </p>
                    </div>
                    <IconButton
                      icon={Trash2}
                      variant="danger"
                      label={`Remover ${e.nome}`}
                      onClick={() => removerEstagiario(i)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="np-card" aria-labelledby={id('doc-titulo')}>
            <header className="np-card__head">
              <span className="np-card__icon">
                <FolderOpen size={18} />
              </span>
              <div>
                <h2 className="np-card__title" id={id('doc-titulo')}>
                  Pacote de documentos
                </h2>
                <p className="np-card__hint">PDF, JPG ou PNG, até 20 MB por arquivo.</p>
              </div>
              <Badge variant={todos.length > 0 && completos === todos.length ? 'approved' : 'neutral'}>
                {completos} de {todos.length}
              </Badge>
            </header>

            <h3 className="np-subtitulo">Do processo</h3>
            <ul className="np-slots">
              <li className="np-slot np-slot--gerado">
                <div className="np-slot__linha">
                  <span className="np-slot__estado" aria-hidden="true">
                    <FileCheck2 size={18} />
                  </span>
                  <span className="np-slot__rotulo">
                    Termo de compromisso de estágio (TCE)
                    <span className="np-slot__nota">
                      Criado pelo sistema com o modelo da SES (Portaria 1327). Você não precisa
                      anexar.
                    </span>
                  </span>
                  <Badge variant="neutral">Gerado pelo sistema</Badge>
                </div>
              </li>
              {DOCS_DO_PROCESSO.map((d) => (
                <ArquivoSlot
                  key={d.chave}
                  rotulo={d.rotulo}
                  arquivo={anexos[d.chave]}
                  erro={errosArquivo[d.chave]}
                  onEscolher={(f) => anexar(d.chave, f)}
                  onRemover={() => remover(d.chave)}
                />
              ))}
            </ul>

            <h3 className="np-subtitulo">De cada estagiário</h3>
            {estagiarios.length === 0 ? (
              <p className="np-vazio">
                Adicione estagiários ao lote para anexar os documentos de cada um.
              </p>
            ) : (
              estagiarios.map((e) => (
                <div key={e.cpf} className="np-grupo">
                  <p className="np-grupo__nome">{e.nome}</p>
                  <ul className="np-slots">
                    {docsDoEstagiario(e.cpf, e.menor).map((d) => (
                      <ArquivoSlot
                        key={d.chave}
                        rotulo={d.rotulo}
                        arquivo={anexos[d.chave]}
                        erro={errosArquivo[d.chave]}
                        onEscolher={(f) => anexar(d.chave, f)}
                        onRemover={() => remover(d.chave)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="np-resumo" aria-label="Resumo do processo">
          <div className="np-resumo__topo">
            <h2 className="np-resumo__title">Resumo</h2>
            <Badge variant="neutral">Rascunho</Badge>
          </div>
          <dl className="np-resumo__lista">
            <div>
              <dt>Estagiários</dt>
              <dd>{estagiarios.length}</dd>
            </div>
            <div>
              <dt>Documentos anexados</dt>
              <dd>
                {completos} de {todos.length}
              </dd>
            </div>
          </dl>

          <div className="np-barra" aria-hidden="true">
            <span style={{ width: `${todos.length ? (completos / todos.length) * 100 : 0}%` }} />
          </div>

          <div className="np-pendencias" id={id('pendencias')} aria-live="polite">
            {pendencias.length === 0 ? (
              <p className="np-pendencias__ok">
                <CircleCheck size={16} /> Pacote completo. Pode enviar.
              </p>
            ) : (
              <>
                <p className="np-pendencias__titulo">Para enviar, falta:</p>
                <ul>
                  {pendencias.slice(0, PENDENCIAS_VISIVEIS).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {pendencias.length > PENDENCIAS_VISIVEIS && (
                    <li>e mais {pendencias.length - PENDENCIAS_VISIVEIS} item(ns)</li>
                  )}
                </ul>
              </>
            )}
          </div>

          {erroEnvio && (
            <div className="np-erro-envio" role="alert">
              <CircleAlert size={16} />
              <p>
                Não foi possível enviar o processo. Nada foi perdido: confira a conexão e tente de
                novo.
              </p>
            </div>
          )}

          <button
            type="button"
            className="np-btn np-btn--primary"
            onClick={enviar}
            disabled={!podeEnviar}
            aria-describedby={id('pendencias')}
          >
            {envio === 'enviando' ? (
              <>
                <Loader2 size={16} className="np-spin" /> Enviando…
              </>
            ) : (
              'Enviar processo'
            )}
          </button>
          <button
            type="button"
            className="np-btn np-btn--ghost"
            onClick={salvarRascunho}
            disabled={envio === 'enviando'}
          >
            Salvar rascunho
          </button>
        </aside>
      </div>

      {toast && (
        <Toast
          variant={toast.variant}
          title={toast.title}
          message={toast.message}
          onUndo={
            toast.undo
              ? () => {
                  toast.undo?.();
                  setToast(null);
                }
              : undefined
          }
          onClose={fecharToast}
        />
      )}
    </>
  );
}
