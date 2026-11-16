import { useId, useState } from 'react';
import { CircleCheck, ExternalLink, MessageSquareWarning } from 'lucide-react';
import Badge, { type BadgeVariant } from '../../components/ui/Badge.tsx';
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
  documento: DocumentoAnalise;
  /** Mensagem para quando a coordenação ainda não pode (ou não pode mais) decidir. */
  somenteLeitura: string | null;
  ocupado: boolean;
  onAprovar: () => void;
  onPendencia: (comentario: string) => void;
}

/** Dados do documento selecionado, decisão da coordenação e histórico de comentários (RF-12). */
export default function DetalheDocumento({
  documento: d,
  somenteLeitura,
  ocupado,
  onAprovar,
  onPendencia,
}: Props) {
  const uid = useId();
  const [apontando, setApontando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

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
        disabled
        title="A visualização do PDF depende do armazenamento da API"
      >
        <ExternalLink size={15} aria-hidden="true" /> Abrir PDF
      </button>

      {somenteLeitura ? (
        <p className="ap-aviso">{somenteLeitura}</p>
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
