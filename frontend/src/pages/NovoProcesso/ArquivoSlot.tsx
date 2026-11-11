import type { ChangeEvent } from 'react';
import { CircleCheck, Paperclip, X } from 'lucide-react';
import IconButton from '../../components/ui/IconButton.tsx';
import { ACCEPT, formatarTamanho } from './pacote.ts';

export interface Arquivo {
  nome: string;
  tamanho: number;
}

interface ArquivoSlotProps {
  rotulo: string;
  arquivo?: Arquivo;
  erro?: string;
  onEscolher: (arquivo: File) => void;
  onRemover: () => void;
}

/** Uma linha do pacote: nome do documento, estado (falta/anexado) e a ação de anexar ou remover. */
export default function ArquivoSlot({
  rotulo,
  arquivo,
  erro,
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
      {erro && (
        <p className="np-error np-slot__erro" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}
