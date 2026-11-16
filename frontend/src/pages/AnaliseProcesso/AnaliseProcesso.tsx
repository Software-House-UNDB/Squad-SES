import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, LoaderCircle } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import Modal from '../../components/ui/Modal.tsx';
import Toast, { type ToastVariant } from '../../components/ui/Toast.tsx';
import {
  buscarProcessoParaAnalise,
  concluirAnalise,
  decidirDocumento,
  iniciarAnalise,
  ProcessoNaoEncontradoError,
  TransicaoInvalidaError,
} from '../../services/analiseService.ts';
import {
  podeDecidir,
  type DocumentoAnalise,
  type ProcessoAnalise,
  type StatusProcesso,
} from './analise.ts';
import DetalheDocumento from './DetalheDocumento.tsx';
import ListaDocumentos from './ListaDocumentos.tsx';
import ResumoAnalise from './ResumoAnalise.tsx';
import './analiseProcesso.css';

const MSG_ERRO_CARGA = 'Não foi possível carregar o processo. Confira a conexão e tente de novo.';
const MSG_ERRO_ACAO = 'Não foi possível concluir a análise. Nada foi alterado; tente de novo.';
const MSG_STATUS_MUDOU =
  'O status deste processo mudou. Recarregue a página para ver a situação atual.';

/** Por que a coordenação não pode decidir os documentos agora; `null` = pode. */
function motivoSomenteLeitura(status: StatusProcesso): string | null {
  if (podeDecidir(status)) return null;
  switch (status) {
    case 'rascunho':
      return 'Este processo ainda é um rascunho e não foi enviado pela UNDB.';
    case 'enviado':
      return 'Inicie a análise para decidir os documentos.';
    case 'pendencia':
      return 'Processo devolvido: aguardando a correção da UNDB.';
    default:
      return 'Análise concluída. Este processo não pode mais ser alterado aqui.';
  }
}

type Confirmacao = 'aprovar' | 'devolver' | null;
interface ToastState {
  variant: ToastVariant;
  title: string;
  message: string;
}

/** Abertura do processo pela coordenação da SES, com análise documento a documento (RF-07, RF-08, RF-12). */
export default function AnaliseProcesso() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const chave = ['analise-processo', id];

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => buscarProcessoParaAnalise(id),
    retry: false,
    enabled: id !== '',
  });
  const processo = consulta.data;

  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fecharToast = useCallback(() => setToast(null), []);

  const cabecalho = (
    <PageHeader
      icon={FileSearch}
      title={processo ? `Processo ${processo.numero}` : 'Processo'}
      breadcrumb={['Gerenciamento', 'Processos', processo?.numero ?? '…']}
    />
  );

  if (consulta.isPending) {
    return (
      <>
        {cabecalho}
        <p className="ap-estado" role="status">
          <LoaderCircle size={18} className="ap-giro" aria-hidden="true" /> Carregando o processo…
        </p>
      </>
    );
  }

  if (!processo) {
    const naoExiste = consulta.error instanceof ProcessoNaoEncontradoError;
    return (
      <>
        {cabecalho}
        <section className="ap-card ap-estado ap-estado--erro" role="alert">
          <p>{naoExiste ? 'Processo não encontrado.' : MSG_ERRO_CARGA}</p>
          <button type="button" className="ap-btn ap-btn--secondary" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </section>
      </>
    );
  }

  const documentos = processo.documentos;
  const selecionado: DocumentoAnalise | undefined =
    documentos.find((d) => d.id === escolhidoId) ??
    documentos.find((d) => d.decisao === 'pendente') ??
    documentos[0];

  async function executar(acao: () => Promise<ProcessoAnalise>): Promise<ProcessoAnalise | null> {
    setErro(null);
    setOcupado(true);
    try {
      const atualizado = await acao();
      queryClient.setQueryData(chave, atualizado);
      return atualizado;
    } catch (e) {
      setErro(e instanceof TransicaoInvalidaError ? MSG_STATUS_MUDOU : MSG_ERRO_ACAO);
      return null;
    } finally {
      setOcupado(false);
    }
  }

  /** Depois de decidir, a seleção anda para o próximo documento ainda não analisado. */
  function avancar(atualizado: ProcessoAnalise, deId: string) {
    const lista = atualizado.documentos;
    const posicao = lista.findIndex((d) => d.id === deId);
    const proximo = [...lista.slice(posicao + 1), ...lista.slice(0, posicao)].find(
      (d) => d.decisao === 'pendente',
    );
    if (proximo) setEscolhidoId(proximo.id);
  }

  async function aprovarDocumento(doc: DocumentoAnalise) {
    const atualizado = await executar(() => decidirDocumento(id, doc.id, { decisao: 'aprovado' }));
    if (atualizado) avancar(atualizado, doc.id);
  }

  async function apontarPendencia(doc: DocumentoAnalise, comentario: string) {
    const atualizado = await executar(() =>
      decidirDocumento(id, doc.id, { decisao: 'pendencia', comentario }),
    );
    if (atualizado) avancar(atualizado, doc.id);
  }

  async function concluir(resultado: 'aprovado' | 'pendencia') {
    setConfirmacao(null);
    const atualizado = await executar(() => concluirAnalise(id, resultado));
    if (!atualizado) return;
    setToast(
      resultado === 'aprovado'
        ? {
            variant: 'approved',
            title: 'Processo aprovado',
            message: 'Os TCEs serão gerados e os signatários receberão o link de assinatura.',
          }
        : {
            variant: 'rejected',
            title: 'Processo devolvido',
            message: 'A UNDB foi avisada e deve corrigir os documentos com pendência.',
          },
    );
  }

  const pendencias = documentos.filter((d) => d.decisao === 'pendencia');

  return (
    <>
      {cabecalho}

      <div className="ap-pagina">
        <ResumoAnalise
          processo={processo}
          ocupado={ocupado}
          erro={erro}
          onIniciar={async () => void (await executar(() => iniciarAnalise(id)))}
          onAprovar={() => setConfirmacao('aprovar')}
          onDevolver={() => setConfirmacao('devolver')}
        />

        <div className="ap-layout">
          <ListaDocumentos
            documentos={documentos}
            selecionadoId={selecionado?.id ?? ''}
            onSelecionar={setEscolhidoId}
          />
          {selecionado && (
            <DetalheDocumento
              key={selecionado.id}
              documento={selecionado}
              somenteLeitura={motivoSomenteLeitura(processo.status)}
              ocupado={ocupado}
              onAprovar={() => aprovarDocumento(selecionado)}
              onPendencia={(texto) => apontarPendencia(selecionado, texto)}
            />
          )}
        </div>
      </div>

      {confirmacao === 'aprovar' && (
        <Modal
          title="Aprovar processo"
          subtitle={`Processo ${processo.numero}`}
          onClose={() => setConfirmacao(null)}
          footer={
            <>
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setConfirmacao(null)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn--success" onClick={() => concluir('aprovado')}>
                Confirmar aprovação
              </button>
            </>
          }
        >
          <p className="ap-modal-texto">
            Todos os {documentos.length} documentos estão aprovados. Ao confirmar, o processo segue para
            a geração dos TCEs e a coleta das assinaturas.
          </p>
        </Modal>
      )}

      {confirmacao === 'devolver' && (
        <Modal
          title="Devolver com pendência"
          subtitle={`Processo ${processo.numero}`}
          onClose={() => setConfirmacao(null)}
          footer={
            <>
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setConfirmacao(null)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn--danger" onClick={() => concluir('pendencia')}>
                Devolver processo
              </button>
            </>
          }
        >
          <p className="ap-modal-texto">A UNDB precisará corrigir e reenviar:</p>
          <ul className="ap-modal-lista">
            {pendencias.map((d) => (
              <li key={d.id}>
                <strong>
                  {d.rotulo}
                  {d.estagiario ? ` (${d.estagiario})` : ''}
                </strong>
                {d.comentarios.filter((c) => c.tipo === 'pendencia').at(-1)?.texto && (
                  <span> — {d.comentarios.filter((c) => c.tipo === 'pendencia').at(-1)?.texto}</span>
                )}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {toast && <Toast {...toast} onClose={fecharToast} />}
    </>
  );
}
