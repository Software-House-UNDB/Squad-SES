import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';

const PENDENCIAS_VISIVEIS = 4;

interface Props {
  estagiarios: number;
  total: number;
  completos: number;
  /** Lista do que falta para liberar o envio (RF-08). */
  pendencias: string[];
  enviando: boolean;
  /** Mensagem do último erro de envio; `null` se não houve. */
  erroEnvio: string | null;
  podeEnviar: boolean;
  id: (nome: string) => string;
  onEnviar: () => void;
  onSalvarRascunho: () => void;
}

/** Barra lateral: contagens, barra de progresso, pendências e botões de envio. */
export default function ResumoProcesso({
  estagiarios,
  total,
  completos,
  pendencias,
  enviando,
  erroEnvio,
  podeEnviar,
  id,
  onEnviar,
  onSalvarRascunho,
}: Props) {
  return (
    <aside className="np-resumo" aria-label="Resumo do processo">
      <div className="np-resumo__topo">
        <h2 className="np-resumo__title">Resumo</h2>
        <Badge variant="neutral">Rascunho</Badge>
      </div>
      <dl className="np-resumo__lista">
        <div>
          <dt>Estagiários</dt>
          <dd>{estagiarios}</dd>
        </div>
        <div>
          <dt>Documentos anexados</dt>
          <dd>
            {completos} de {total}
          </dd>
        </div>
      </dl>

      <div className="np-barra" aria-hidden="true">
        <span style={{ width: `${total ? (completos / total) * 100 : 0}%` }} />
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
          <p>{erroEnvio}</p>
        </div>
      )}

      <button
        type="button"
        className="np-btn np-btn--primary"
        onClick={onEnviar}
        disabled={!podeEnviar}
        aria-describedby={id('pendencias')}
      >
        {enviando ? (
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
        onClick={onSalvarRascunho}
        disabled={enviando}
      >
        Salvar rascunho
      </button>
    </aside>
  );
}
