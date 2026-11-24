import type { ChangeEvent } from 'react';
import { Paperclip } from 'lucide-react';
import Badge, { type BadgeVariant } from '../../components/ui/Badge.tsx';
import {
  decisaoVisivel,
  podeSubstituir,
  ultimaPendencia,
  type DecisaoDoc,
  type DocumentoAnalise,
  type StatusProcesso,
} from '../AnaliseProcesso/analise.ts';
import { ACCEPT, formatarTamanho } from '../NovoProcesso/pacote.ts';

// Na visão do representante, "não analisado" é "aguardando análise": ou a SES ainda não chegou
// nele, ou a nova versão acabou de ser anexada.
const ROTULO: Record<DecisaoDoc, string> = {
  pendente: 'Aguardando análise',
  aprovado: 'Aprovado',
  pendencia: 'Pendência',
};

const BADGE: Record<DecisaoDoc, BadgeVariant> = {
  pendente: 'neutral',
  aprovado: 'approved',
  pendencia: 'rejected',
};

interface Props {
  documento: DocumentoAnalise;
  statusProcesso: StatusProcesso;
  ocupado: boolean;
  erro?: string;
  onSubstituir: (arquivo: File) => void;
}

/** Um documento do pacote: situação, motivo da pendência (RF-12) e, se for o caso, a troca do arquivo. */
export default function DocumentoCorrecao({
  documento: d,
  statusProcesso,
  ocupado,
  erro,
  onSubstituir,
}: Props) {
  const nome = `${d.rotulo}${d.estagiario ? ` (${d.estagiario})` : ''}`;
  const motivo = ultimaPendencia(d);
  const corrigivel = podeSubstituir(statusProcesso, d);
  const decisao = decisaoVisivel(statusProcesso, d.decisao);

  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0];
    if (escolhido) onSubstituir(escolhido);
    e.target.value = '';
  }

  return (
    <li className={`mp-doc mp-doc--${decisao}`}>
      <div className="mp-doc__topo">
        <div className="mp-doc__titulo">
          <strong>{d.rotulo}</strong>
          {d.estagiario && <span className="mp-doc__estagiario">{d.estagiario}</span>}
        </div>
        <Badge variant={BADGE[decisao]}>{ROTULO[decisao]}</Badge>
      </div>

      <p className="mp-doc__arquivo">
        <Paperclip size={14} aria-hidden="true" /> {d.nomeArquivo} · {formatarTamanho(d.tamanhoBytes)} · versão{' '}
        {d.versao}
      </p>

      {corrigivel && motivo && (
        <div className="ap-comentario ap-comentario--pendencia">
          <p className="ap-comentario__cab">
            <strong>Motivo da pendência</strong>
          </p>
          <p className="ap-comentario__texto">{motivo}</p>
        </div>
      )}

      {corrigivel && (
        <label className={`ap-btn ap-btn--secondary ap-btn--sm mp-anexar${ocupado ? ' mp-anexar--off' : ''}`}>
          Anexar nova versão
          <input
            type="file"
            className="mp-sr-only"
            accept={ACCEPT}
            disabled={ocupado}
            aria-label={`Anexar nova versão de ${nome}`}
            onChange={aoEscolher}
          />
        </label>
      )}

      {erro && (
        <p className="ap-erro" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}
