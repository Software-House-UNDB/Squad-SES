import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, FilePlus2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import Badge from '../../components/ui/Badge.tsx';
import Toast from '../../components/ui/Toast.tsx';
import { ArquivoRepetidoError, enviarProcesso } from '../../services/processoService.ts';
import type { Arquivo } from './ArquivoSlot.tsx';
import LoteEstagiarios from './LoteEstagiarios.tsx';
import {
  exigidos,
  hashDoArquivo,
  MSG_ARQUIVO_REPETIDO,
  pendenciasDoPacote,
  validarArquivo,
} from './pacote.ts';
import PacoteDocumentos from './PacoteDocumentos.tsx';
import ResumoProcesso from './ResumoProcesso.tsx';
import {
  ESTAGIARIO_VAZIO,
  validarEstagiario,
  type ErrosEstagiario,
  type EstagiarioForm,
} from './validacao.ts';
import './novoProcesso.css';

const MSG_ERRO_ENVIO =
  'Não foi possível enviar o processo. Nada foi perdido: confira a conexão e tente de novo.';

type Envio = 'editando' | 'enviando' | 'enviado';

interface ToastState {
  variant: 'approved' | 'rejected';
  title: string;
  message: string;
  undo?: () => void;
}

/** Tela "Novo processo de documentação" do representante da IES (RF-06, RF-08, RF-09, RF-10, RF-13). */
export default function NovoProcesso() {
  const [estagiarios, setEstagiarios] = useState<EstagiarioForm[]>([]);
  const [rascunho, setRascunho] = useState<EstagiarioForm>(ESTAGIARIO_VAZIO);
  const [erros, setErros] = useState<ErrosEstagiario>({});
  const [anexos, setAnexos] = useState<Record<string, Arquivo>>({});
  const [errosArquivo, setErrosArquivo] = useState<Record<string, string>>({});
  const [envio, setEnvio] = useState<Envio>('editando');
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
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

  async function anexar(chave: string, arquivo: File) {
    let problema = validarArquivo(arquivo);
    const hash = problema ? null : await hashDoArquivo(arquivo);
    // O backend recusa (409) o mesmo arquivo duas vezes no processo; avisamos antes de enviar.
    if (hash && Object.entries(anexos).some(([k, a]) => k !== chave && a.hash === hash)) {
      problema = MSG_ARQUIVO_REPETIDO;
    }
    if (!montado.current) return;
    setErrosArquivo((atual) => {
      const { [chave]: _antigo, ...resto } = atual;
      return problema ? { ...resto, [chave]: problema } : resto;
    });
    if (!problema) {
      setAnexos((atual) => ({ ...atual, [chave]: { nome: arquivo.name, tamanho: arquivo.size, hash: hash ?? undefined } }));
    }
  }

  function remover(chave: string) {
    setAnexos((atual) => {
      const { [chave]: _removido, ...resto } = atual;
      return resto;
    });
  }

  async function enviar() {
    if (!podeEnviar) return;
    setErroEnvio(null);
    setEnvio('enviando');
    try {
      await enviarProcesso();
      if (montado.current) setEnvio('enviado');
    } catch (e) {
      if (!montado.current) return;
      setEnvio('editando');
      setErroEnvio(e instanceof ArquivoRepetidoError ? MSG_ARQUIVO_REPETIDO : MSG_ERRO_ENVIO);
    }
  }

  // TODO: persistir o rascunho quando existir o endpoint de rascunho na API.
  // Hoje só avisa o usuário; nada é salvo.
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
    setErroEnvio(null);
    setEnvio('editando');
  }

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
          <LoteEstagiarios
            estagiarios={estagiarios}
            rascunho={rascunho}
            erros={erros}
            id={id}
            nomeRef={nomeRef}
            onCampo={campo}
            onAdicionar={adicionarEstagiario}
            onRemover={removerEstagiario}
          />
          <PacoteDocumentos
            estagiarios={estagiarios}
            anexos={anexos}
            errosArquivo={errosArquivo}
            total={todos.length}
            completos={completos}
            id={id}
            onAnexar={anexar}
            onRemover={remover}
          />
        </div>

        <ResumoProcesso
          estagiarios={estagiarios.length}
          total={todos.length}
          completos={completos}
          pendencias={pendencias}
          enviando={envio === 'enviando'}
          erroEnvio={erroEnvio}
          podeEnviar={podeEnviar}
          id={id}
          onEnviar={enviar}
          onSalvarRascunho={salvarRascunho}
        />
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
