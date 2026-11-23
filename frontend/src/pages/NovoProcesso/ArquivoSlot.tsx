import type { ChangeEvent } from 'react';
import { CircleCheck, Paperclip, X } from 'lucide-react';
import type { EstadoUpload } from './useUploads.ts';
import IconButton from '../../components/ui/IconButton.tsx';
import { ACCEPT, formatarTamanho } from './pacote.ts';

export interface Arquivo {
  nome: string;
  tamanho: number;
  /** SHA-256 do conteúdo; o backend recusa o mesmo arquivo duas vezes no processo (409). */
  hash?: string;
}

interface ArquivoSlotProps {
  rotulo: string;
  arquivo?: Arquivo;
  erro?: string;
  /** Andamento do envio ao servidor; sem ele o slot só mostra o anexo escolhido. */
  envio?: EstadoUpload;
  onCancelarEnvio?: () => void;
  onTentarDeNovo?: () => void;
  onEscolher: (arquivo: File) => void;
  onRemover: () => void;
}

/** Uma linha do pacote: nome do documento, estado (falta/anexado) e a ação de anexar ou remover. */
export default function ArquivoSlot({
  rotulo,
  arquivo,
  erro,
  envio,
  onCancelarEnvio,
  onTentarDeNovo,
  onEscolher,
  onRemover,
}: ArquivoSlotProps) {
  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0];
    if (escolhido) onEscolher(escolhido);
    e.target.value = '';
  }

  return (
    <li className={`np-slot ${arquivo ? 'np-slot--ok' : ''}`}>
      <div className="np-slot__linha">
        <span className="np-slot__estado" aria-hidden="true">
          {arquivo ? <CircleCheck size={18} /> : <span className="np-slot__vazio" />}
        </span>
        <span className="np-slot__rotulo">
          {rotulo} <span className="np-slot__obrig">obrigatório</span>
        </span>

        {arquivo ? (
          <span className="np-arquivo">
            <Paperclip size={14} aria-hidden="true" />
            <span className="np-arquivo__nome" title={arquivo.nome}>
              {arquivo.nome}
            </span>
            <span className="np-arquivo__tam">{formatarTamanho(arquivo.tamanho)}</span>
            <IconButton icon={X} label={`Remover ${rotulo}`} onClick={onRemover} />
          </span>
        ) : (
          <label className="np-btn np-btn--secondary np-btn--sm">
            Anexar
            <input
              type="file"
              className="np-sr-only"
              accept={ACCEPT}
              aria-label={`Anexar ${rotulo}`}
              onChange={aoEscolher}
            />
          </label>
        )}
      </div>
      {envio?.fase === 'enviando' && (
        <div className="np-upload">
          <progress
            className="np-upload__barra"
            max={100}
            value={envio.progresso}
            aria-label={`Enviando ${rotulo}`}
          />
          <span className="np-upload__pct">{envio.progresso}%</span>
          {onCancelarEnvio && (
            <button type="button" className="np-btn np-btn--secondary np-btn--sm" onClick={onCancelarEnvio}>
              Cancelar envio
            </button>
          )}
        </div>
      )}
      {envio?.fase === 'erro' && (
        <div className="np-error np-slot__erro" role="alert">
          {envio.mensagem}{' '}
          {onTentarDeNovo && (
            <button type="button" className="np-btn np-btn--secondary np-btn--sm" onClick={onTentarDeNovo}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
      {erro && (
        <p className="np-error np-slot__erro" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}
