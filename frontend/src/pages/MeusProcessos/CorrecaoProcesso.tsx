import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, LoaderCircle, Send } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import Badge from '../../components/ui/Badge.tsx';
import Modal from '../../components/ui/Modal.tsx';
import Toast, { type ToastVariant } from '../../components/ui/Toast.tsx';
import {
  buscarProcessoParaAnalise,
  ProcessoNaoEncontradoError,
  reenviarProcesso,
  substituirDocumento,
  TransicaoInvalidaError,
} from '../../services/analiseService.ts';
import { ArquivoRepetidoError } from '../../services/processoService.ts';
import {
  agruparDocumentos,
  documentosComPendencia,
  formatarData,
  podeReenviar,
  type ProcessoAnalise,
} from '../AnaliseProcesso/analise.ts';
import {
  STATUS_PROCESSO_LABEL,
  STATUS_PROCESSO_VARIANT,
  type StatusProcesso,
} from '../../domain/processo.ts';
import { hashDoArquivo, MSG_ARQUIVO_REPETIDO, validarArquivo } from '../NovoProcesso/pacote.ts';
import '../AnaliseProcesso/analiseProcesso.css';
import DocumentoCorrecao from './DocumentoCorrecao.tsx';
import './meusProcessos.css';

const MSG_ERRO_CARGA = 'Não foi possível carregar o processo. Confira a conexão e tente de novo.';
const MSG_ERRO_ENVIO = 'Não foi possível anexar o arquivo. Nada foi alterado; tente de novo.';
const MSG_ERRO_REENVIO = 'Não foi possível reenviar o processo. Nada foi alterado; tente de novo.';
const MSG_STATUS_MUDOU =
  'O status deste processo mudou. Recarregue a página para ver a situação atual.';

/** Aviso por status quando não há nada a corrigir; `pendencia` não tem aviso: é o momento da ação. */
function avisoDoStatus(status: StatusProcesso): string | null {
  switch (status) {
    case 'pendencia':
      return null;
    case 'rascunho':
      return 'Este processo ainda é um rascunho e não foi enviado à SES.';
    case 'enviado':
      return 'Processo enviado: aguardando a coordenação da SES iniciar a análise.';
    case 'em_analise':
      return 'A coordenação da SES está analisando os documentos.';
    case 'aprovado':
      return 'Processo aprovado: a SES gera os TCEs e, em seguida, libera as assinaturas.';
    case 'aguardando_assinaturas':
      return 'Aguardando as assinaturas do TCE e das declarações.';
    default:
      return 'Processo concluído.';
  }
}

interface ToastState {
  variant: ToastVariant;
  title: string;
  message: string;
}

/** Correção das pendências apontadas pela SES e reenvio do processo (RF-07, RF-08, RF-12). */
export default function CorrecaoProcesso() {
  const { id = '' } = useParams();
  // key: ao trocar de processo (ex.: pelo histórico do navegador) o estado local — erros, aviso,
  // confirmação aberta — recomeça do zero em vez de vazar para o outro processo.
  return <CorrecaoDoProcesso key={id} id={id} />;
}

function CorrecaoDoProcesso({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const chave = ['meu-processo', id];

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => buscarProcessoParaAnalise(id),
    retry: false,
    enabled: id !== '',
  });
  const processo = consulta.data;

  const [ocupado, setOcupado] = useState(false);
  const [errosDoc, setErrosDoc] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fecharToast = useCallback(() => setToast(null), []);

  const cabecalho = (
    <PageHeader
      icon={FileCheck2}
      title={processo ? `Processo ${processo.numero}` : 'Processo'}
      breadcrumb={['Gerenciamento', 'Meus processos', processo?.numero ?? '…']}
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
          <Link to="/gerenciamento/meus-processos" className="mp-voltar">
            Voltar para Meus processos
          </Link>
        </section>
      </>
    );
  }

  const { status, documentos } = processo;
  const abertas = documentosComPendencia(documentos).length;
  const aviso = avisoDoStatus(status);

  function aplicar(atualizado: ProcessoAnalise) {
    queryClient.setQueryData(chave, atualizado);
    // O mesmo processo aparece na lista e na análise da coordenação: que releiam na próxima visita.
    void queryClient.invalidateQueries({ queryKey: ['meus-processos'] });
    void queryClient.invalidateQueries({ queryKey: ['analise-processo', id] });
  }

  function mensagemDe(e: unknown, padrao: string) {
    if (e instanceof ArquivoRepetidoError) return MSG_ARQUIVO_REPETIDO;
    if (e instanceof TransicaoInvalidaError) return MSG_STATUS_MUDOU;
    return padrao;
  }

  function erroDoDoc(docId: string, mensagem: string | null) {
    setErrosDoc((atual) => {
      const proximo = { ...atual };
      if (mensagem) proximo[docId] = mensagem;
      else delete proximo[docId];
      return proximo;
    });
  }

  async function substituir(docId: string, arquivo: File) {
    erroDoDoc(docId, null);
    setErro(null);
    const invalido = validarArquivo(arquivo);
    if (invalido) return erroDoDoc(docId, invalido);

    setOcupado(true);
    try {
      const hash = await hashDoArquivo(arquivo);
      const atualizado = await substituirDocumento(id, docId, {
        nomeArquivo: arquivo.name,
        tamanhoBytes: arquivo.size,
        ...(hash ? { hashSha256: hash } : {}),
      });
      aplicar(atualizado);
    } catch (e) {
      erroDoDoc(docId, mensagemDe(e, MSG_ERRO_ENVIO));
    } finally {
      setOcupado(false);
    }
  }

  async function reenviar() {
    setConfirmando(false);
    setErro(null);
    setOcupado(true);
    try {
      aplicar(await reenviarProcesso(id));
      setToast({
        variant: 'approved',
        title: 'Processo reenviado',
        message: 'A coordenação da SES vai analisar os documentos corrigidos.',
      });
    } catch (e) {
      setErro(mensagemDe(e, MSG_ERRO_REENVIO));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {cabecalho}

      <div className="ap-pagina">
        <Link to="/gerenciamento/meus-processos" className="mp-voltar">
          ← Meus processos
        </Link>

        <section className="ap-card ap-resumo" aria-label="Resumo do processo">
          <div className="ap-resumo__info">
            <div className="ap-resumo__linha">
              <Badge variant={STATUS_PROCESSO_VARIANT[status]}>{STATUS_PROCESSO_LABEL[status]}</Badge>
              <span className="ap-resumo__meta">
                {processo.instituicao} · {processo.estagiarios} estagiário(s) · enviado em{' '}
                {formatarData(processo.enviadoEm)}
              </span>
            </div>
          </div>

          {status === 'pendencia' && (
            <div className="ap-resumo__acoes">
              <button
                type="button"
                className="ap-btn ap-btn--primary"
                disabled={ocupado || !podeReenviar(status, documentos)}
                onClick={() => setConfirmando(true)}
              >
                <Send size={16} aria-hidden="true" /> Reenviar processo
              </button>
            </div>
          )}

          {status === 'pendencia' && (
            <p className="ap-dica">
              {abertas > 0
                ? `Substitua ${abertas === 1 ? 'o documento' : `os ${abertas} documentos`} com pendência para reenviar o processo (RF-08).`
                : 'Todas as pendências foram corrigidas. Reenvie o processo para a SES analisar de novo.'}
            </p>
          )}
          {aviso && <p className="ap-aviso ap-dica">{aviso}</p>}
          {erro && (
            <p role="alert" className="ap-erro ap-resumo__erro">
              {erro}
            </p>
          )}
        </section>

        <div className="mp-grupos">
          {agruparDocumentos(documentos).map((grupo) => (
            <section key={grupo.titulo} aria-label={grupo.titulo}>
              <h2 className="mp-grupo__titulo">{grupo.titulo}</h2>
              <ul className="mp-docs">
                {grupo.documentos.map((d) => (
                  <DocumentoCorrecao
                    key={d.id}
                    documento={d}
                    statusProcesso={status}
                    ocupado={ocupado}
                    erro={errosDoc[d.id]}
                    onSubstituir={(arquivo) => substituir(d.id, arquivo)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {confirmando && (
        <Modal
          title="Reenviar processo"
          subtitle={`Processo ${processo.numero}`}
          onClose={() => setConfirmando(false)}
          footer={
            <>
              <button type="button" className="ap-btn ap-btn--ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn--primary" onClick={reenviar}>
                Confirmar reenvio
              </button>
            </>
          }
        >
          <p className="ap-modal-texto">
            A coordenação da SES volta a analisar o processo. Os documentos já aprovados continuam
            aprovados; só os que você corrigiu serão analisados de novo.
          </p>
        </Modal>
      )}

      {toast && <Toast {...toast} onClose={fecharToast} />}
    </>
  );
}
