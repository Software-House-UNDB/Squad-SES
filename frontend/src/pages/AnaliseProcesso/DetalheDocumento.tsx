import { useId, useState } from 'react';
import { CircleCheck, ExternalLink, MessageSquareWarning } from 'lucide-react';
import Badge, { type BadgeVariant } from '../../components/ui/Badge.tsx';
import Modal from '../../components/ui/Modal.tsx';
import PdfViewer from '../../components/ui/PdfViewer.tsx';
import { obterUrlDocumento } from '../../services/documentoService.ts';
import { formatarTamanho } from '../NovoProcesso/pacote.ts';
import { DECISAO_LABEL, LIMITE_COMENTARIO, validarComentario, type DocumentoAnalise, type TipoComentario } from './analise.ts';

const BADGE: Record<DocumentoAnalise['decisao'], BadgeVariant> = {
  pendente: 'neutral',
  aprovado: 'approved',
  pendencia: 'rejected',
};

const TIPO_COMENTARIO: Record<TipoComentario, string> = {
  pendencia: 'Pendência',
  observacao: 'Observação',
  resposta: 'Resposta da UNDB',
};

const formatarData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });

interface Props {
  processoId: string;
  documento: DocumentoAnalise;
  /** A coordenação pode decidir este documento agora (processo em análise). */
  podeDecidir: boolean;
  /** Aviso no lugar dos botões quando não pode decidir; sem aviso, a seção some. */
  aviso: string | null;
  ocupado: boolean;
  onAprovar: () => void;
  onPendencia: (comentario: string) => void;
}

/** Dados do documento selecionado, decisão da coordenação e histórico de comentários (RF-12). */
export default function DetalheDocumento({
  processoId,
  documento: d,
  podeDecidir,
  aviso,
  ocupado,
  onAprovar,
  onPendencia,
}: Props) {
  const uid = useId();
  const [apontando, setApontando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [urlPdf, setUrlPdf] = useState<string | null>(null);
  const [abrindoPdf, setAbrindoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  async function abrirPdf() {
    setAbrindoPdf(true);
    setErroPdf(null);
    try {
      // A URL assinada expira em pouco tempo; por isso é pedida a cada abertura.
      setUrlPdf((await obterUrlDocumento(processoId, d.id)).url);
    } catch {
      setErroPdf('Não foi possível obter o link do PDF. Tente de novo em instantes.');
    } finally {
      setAbrindoPdf(false);
    }
  }

  function registrar() {
    const problema = validarComentario(texto);
    setErro(problema);
    if (problema) return;
    onPendencia(texto.trim());
  }

  return (
    <section className="ap-card ap-detalhe" aria-label={`Documento: ${d.rotulo}`}>
      <header className="ap-detalhe__topo">
        <div>
          <h2 className="ap-detalhe__titulo">{d.rotulo}</h2>
          <p className="ap-detalhe__sub">
            {d.estagiario ? `Estagiário: ${d.estagiario}` : 'Documento do processo'} · versão {d.versao}
          </p>
        </div>
        <Badge variant={BADGE[d.decisao]}>{DECISAO_LABEL[d.decisao]}</Badge>
      </header>

      <dl className="ap-meta">
        <div>
          <dt>Arquivo</dt>
          <dd>{d.nomeArquivo}</dd>
        </div>
        <div>
          <dt>Tamanho</dt>
          <dd>{formatarTamanho(d.tamanhoBytes)}</dd>
        </div>
        <div className="ap-meta__hash">
          <dt>SHA-256</dt>
          <dd className="ap-hash">{d.hashSha256}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="ap-btn ap-btn--ghost ap-btn--sm"
        disabled={abrindoPdf}
        onClick={() => void abrirPdf()}
      >
        <ExternalLink size={15} aria-hidden="true" /> {abrindoPdf ? 'Abrindo…' : 'Abrir PDF'}
      </button>
      {erroPdf && (
        <p role="alert" className="ap-erro">
          {erroPdf}
        </p>
      )}
      {urlPdf && (
        <Modal title={d.rotulo} subtitle={d.nomeArquivo} size="lg" onClose={() => setUrlPdf(null)}>
          <PdfViewer url={urlPdf} titulo={d.rotulo} />
        </Modal>
      )}

      {!podeDecidir ? (
        aviso && <p className="ap-aviso">{aviso}</p>
      ) : (
        <div className="ap-decisao">
          {!apontando && (
            <div className="ap-acoes">
              <button
                type="button"
                className="ap-btn ap-btn--success"
                disabled={ocupado || d.decisao === 'aprovado'}
                onClick={onAprovar}
              >
                <CircleCheck size={16} aria-hidden="true" /> Aprovar documento
              </button>
              <button
                type="button"
                className="ap-btn ap-btn--danger-outline"
                disabled={ocupado}
                onClick={() => setApontando(true)}
              >
                <MessageSquareWarning size={16} aria-hidden="true" /> Apontar pendência
              </button>
            </div>
          )}

          {apontando && (
            <div className="ap-pendencia">
              <label htmlFor={`${uid}-comentario`} className="ap-label">
                Comentário da pendência
              </label>
              <textarea
                id={`${uid}-comentario`}
                className="ap-textarea"
                rows={4}
                value={texto}
                maxLength={LIMITE_COMENTARIO + 50}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? `${uid}-erro` : undefined}
                placeholder="Diga à UNDB o que precisa ser corrigido neste documento."
                onChange={(e) => {
                  setTexto(e.target.value);
                  if (erro) setErro(null);
                }}
                autoFocus
              />
              {erro && (
                <p id={`${uid}-erro`} role="alert" className="ap-erro">
                  {erro}
                </p>
              )}
              <div className="ap-acoes">
                <button type="button" className="ap-btn ap-btn--danger" disabled={ocupado} onClick={registrar}>
                  Registrar pendência
                </button>
                <button
                  type="button"
                  className="ap-btn ap-btn--ghost"
                  disabled={ocupado}
                  onClick={() => {
                    setApontando(false);
                    setTexto('');
                    setErro(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ap-comentarios">
        <h3 className="ap-subtitulo">Comentários</h3>
        {d.comentarios.length === 0 ? (
          <p className="ap-vazio">Nenhum comentário neste documento.</p>
        ) : (
          <ul className="ap-comentarios__lista">
            {d.comentarios.map((c) => (
              <li key={c.id} className={`ap-comentario ap-comentario--${c.tipo}`}>
                <p className="ap-comentario__cab">
                  <strong>{TIPO_COMENTARIO[c.tipo]}</strong> · {c.autor} · {formatarData(c.criadoEm)}
                </p>
                <p className="ap-comentario__texto">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
