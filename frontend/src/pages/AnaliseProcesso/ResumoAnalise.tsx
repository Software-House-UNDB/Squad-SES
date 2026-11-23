import { CircleCheck, Play, Undo2 } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import {
  formatarData,
  podeAprovarProcesso,
  podeDevolverProcesso,
  progresso,
  STATUS_BADGE,
  STATUS_LABEL,
  type ProcessoAnalise,
} from './analise.ts';

interface Props {
  processo: ProcessoAnalise;
  ocupado: boolean;
  erro: string | null;
  onIniciar: () => void;
  onAprovar: () => void;
  onDevolver: () => void;
}

/** Cabeçalho do processo: status, andamento da análise e as ações que mudam o status. */
export default function ResumoAnalise({ processo, ocupado, erro, onIniciar, onAprovar, onDevolver }: Props) {
  const { analisados, total } = progresso(processo.documentos);
  const percentual = total === 0 ? 0 : Math.round((analisados / total) * 100);
  const { status, documentos } = processo;

  return (
    <section className="ap-card ap-resumo" aria-label="Resumo da análise">
      <div className="ap-resumo__info">
        <div className="ap-resumo__linha">
          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
          <span className="ap-resumo__meta">
            {processo.instituicao} · {processo.estagiarios} estagiário(s) · enviado em{' '}
            {formatarData(processo.enviadoEm)}
          </span>
        </div>
        <div className="ap-progresso">
          <div
            className="ap-progresso__barra"
            role="progressbar"
            aria-label="Documentos analisados"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={analisados}
          >
            <span style={{ width: `${percentual}%` }} />
          </div>
          <span className="ap-progresso__texto">
            {analisados} de {total} analisados
          </span>
        </div>
      </div>

      <div className="ap-resumo__acoes">
        {status === 'enviado' && (
          <button type="button" className="ap-btn ap-btn--primary" disabled={ocupado} onClick={onIniciar}>
            <Play size={16} aria-hidden="true" /> Iniciar análise
          </button>
        )}
        {status === 'em_analise' && (
          <>
            <button
              type="button"
              className="ap-btn ap-btn--danger-outline"
              disabled={ocupado || !podeDevolverProcesso(status, documentos)}
              onClick={onDevolver}
            >
              <Undo2 size={16} aria-hidden="true" /> Devolver com pendência
            </button>
            <button
              type="button"
              className="ap-btn ap-btn--success"
              disabled={ocupado || !podeAprovarProcesso(status, documentos)}
              onClick={onAprovar}
            >
              <CircleCheck size={16} aria-hidden="true" /> Aprovar processo
            </button>
          </>
        )}
      </div>

      {status === 'enviado' && <p className="ap-dica">Inicie a análise para decidir os documentos.</p>}
      {status === 'em_analise' && !podeAprovarProcesso(status, documentos) && (
        <p className="ap-dica">
          Para aprovar o processo, todos os documentos precisam estar aprovados (RF-08).
        </p>
      )}
      {erro && (
        <p role="alert" className="ap-erro ap-resumo__erro">
          {erro}
        </p>
      )}
    </section>
  );
}
