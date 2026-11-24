import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';
import type { ErrosProcesso, ProcessoForm } from './validacao.ts';

interface Props {
  dados: ProcessoForm;
  erros: ErrosProcesso;
  id: (nome: string) => string;
  onCampo: <K extends keyof ProcessoForm>(chave: K, valor: ProcessoForm[K]) => void;
}

/** Card "Dados do processo": tipo de estágio e supervisor do campo, que entram no TCE. */
export default function DadosDoProcesso({ dados, erros, id, onCampo }: Props) {
  const erro = (chave: keyof ProcessoForm): ReactNode =>
    erros[chave] ? (
      <span className="np-error" id={id(`${chave}-erro`)} role="alert">
        {erros[chave]}
      </span>
    ) : null;
  const aria = (chave: keyof ProcessoForm) => ({
    id: id(chave),
    'aria-invalid': erros[chave] ? true : undefined,
    'aria-describedby': erros[chave] ? id(`${chave}-erro`) : undefined,
  });

  return (
    <section className="np-card" aria-labelledby={id('proc-titulo')}>
      <header className="np-card__head">
        <span className="np-card__icon">
          <ClipboardList size={18} />
        </span>
        <div>
          <h2 className="np-card__title" id={id('proc-titulo')}>
            Dados do processo
          </h2>
          <p className="np-card__hint">
            Valem para todo o lote. O supervisor assina o TCE pelo e-mail informado.
          </p>
        </div>
      </header>

      <div className="np-grid">
        <div className="np-field np-span-2">
          <label htmlFor={id('tipoEstagio')}>Tipo de estágio</label>
          <select
            {...aria('tipoEstagio')}
            value={dados.tipoEstagio}
            onChange={(e) => onCampo('tipoEstagio', e.target.value as ProcessoForm['tipoEstagio'])}
          >
            <option value="">Selecione</option>
            <option value="obrigatorio">Obrigatório</option>
            <option value="pos_graduacao">Pós-graduação</option>
          </select>
          {erro('tipoEstagio')}
        </div>
        <div className="np-field">
          <label htmlFor={id('supervisorNome')}>Nome do supervisor</label>
          <input
            {...aria('supervisorNome')}
            autoComplete="off"
            value={dados.supervisorNome}
            onChange={(e) => onCampo('supervisorNome', e.target.value)}
          />
          {erro('supervisorNome')}
        </div>
        <div className="np-field">
          <label htmlFor={id('supervisorEmail')}>E-mail do supervisor</label>
          <input
            {...aria('supervisorEmail')}
            type="email"
            autoComplete="off"
            value={dados.supervisorEmail}
            onChange={(e) => onCampo('supervisorEmail', e.target.value)}
          />
          {erro('supervisorEmail')}
        </div>
      </div>
    </section>
  );
}
