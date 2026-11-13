import type { FormEvent, ReactNode, RefObject } from 'react';
import { Trash2, UserPlus, Users } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import IconButton from '../../components/ui/IconButton.tsx';
import { formatarCpf, type ErrosEstagiario, type EstagiarioForm } from './validacao.ts';

interface Props {
  estagiarios: EstagiarioForm[];
  rascunho: EstagiarioForm;
  erros: ErrosEstagiario;
  /** Gera ids únicos (prefixados com o useId da tela) para labels e mensagens de erro. */
  id: (nome: string) => string;
  nomeRef: RefObject<HTMLInputElement | null>;
  onCampo: <K extends keyof EstagiarioForm>(chave: K, valor: EstagiarioForm[K]) => void;
  onAdicionar: (e: FormEvent) => void;
  onRemover: (indice: number) => void;
}

/** Card "Estagiários do lote": formulário de cadastro + lista dos já adicionados. */
export default function LoteEstagiarios({
  estagiarios,
  rascunho,
  erros,
  id,
  nomeRef,
  onCampo,
  onAdicionar,
  onRemover,
}: Props) {
  const erro = (chave: keyof EstagiarioForm): ReactNode =>
    erros[chave] ? (
      <span className="np-error" id={id(`${chave}-erro`)} role="alert">
        {erros[chave]}
      </span>
    ) : null;
  const aria = (chave: keyof EstagiarioForm) => ({
    id: id(chave),
    'aria-invalid': erros[chave] ? true : undefined,
    'aria-describedby': erros[chave] ? id(`${chave}-erro`) : undefined,
  });

  return (
    <section className="np-card" aria-labelledby={id('est-titulo')}>
      <header className="np-card__head">
        <span className="np-card__icon">
          <Users size={18} />
        </span>
        <div>
          <h2 className="np-card__title" id={id('est-titulo')}>
            Estagiários do lote
          </h2>
          <p className="np-card__hint">Adicione um por vez. Todos os campos são obrigatórios.</p>
        </div>
        <Badge variant={estagiarios.length ? 'approved' : 'neutral'}>
          {estagiarios.length} no lote
        </Badge>
      </header>

      <form className="np-form" onSubmit={onAdicionar} noValidate>
        <div className="np-grid">
          <div className="np-field np-span-2">
            <label htmlFor={id('nome')}>Nome completo</label>
            <input
              {...aria('nome')}
              ref={nomeRef}
              value={rascunho.nome}
              onChange={(e) => onCampo('nome', e.target.value)}
              autoComplete="off"
            />
            {erro('nome')}
          </div>
          <div className="np-field">
            <label htmlFor={id('cpf')}>CPF</label>
            <input
              {...aria('cpf')}
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={rascunho.cpf}
              onChange={(e) => onCampo('cpf', formatarCpf(e.target.value))}
            />
            {erro('cpf')}
          </div>
          <div className="np-field">
            <label htmlFor={id('matricula')}>Matrícula</label>
            <input
              {...aria('matricula')}
              value={rascunho.matricula}
              onChange={(e) => onCampo('matricula', e.target.value)}
            />
            {erro('matricula')}
          </div>
          <div className="np-field np-span-2">
            <label htmlFor={id('curso')}>Curso</label>
            <input
              {...aria('curso')}
              value={rascunho.curso}
              onChange={(e) => onCampo('curso', e.target.value)}
            />
            {erro('curso')}
          </div>
          <label className="np-check-menor np-span-2">
            <input
              type="checkbox"
              checked={rascunho.menor}
              onChange={(e) => {
                onCampo('menor', e.target.checked);
                if (!e.target.checked) onCampo('responsavel', '');
              }}
            />
            <span>
              <strong>Estagiário menor de idade</strong>
              <small>Exige identidade e declaração do responsável no pacote.</small>
            </span>
          </label>
          {rascunho.menor && (
            <div className="np-field np-span-2">
              <label htmlFor={id('responsavel')}>Nome do responsável</label>
              <input
                {...aria('responsavel')}
                value={rascunho.responsavel}
                onChange={(e) => onCampo('responsavel', e.target.value)}
                autoComplete="off"
              />
              {erro('responsavel')}
            </div>
          )}
        </div>

        <div className="np-form__actions">
          <button type="submit" className="np-btn np-btn--secondary">
            <UserPlus size={16} />
            Adicionar ao lote
          </button>
        </div>
      </form>

      {estagiarios.length > 0 && (
        <ul className="np-lista" aria-label="Estagiários do lote">
          {estagiarios.map((e, i) => (
            <li key={e.cpf} className="np-aluno">
              <span className="np-aluno__avatar" aria-hidden="true">
                {e.nome.trim()[0]?.toUpperCase()}
              </span>
              <div className="np-aluno__info">
                <p className="np-aluno__nome">
                  {e.nome}
                  {e.menor && <Badge variant="pending">Menor de idade</Badge>}
                </p>
                <p className="np-aluno__detalhe">
                  {e.curso} · Mat. {e.matricula} · CPF {e.cpf}
                  {e.menor ? ` · Responsável: ${e.responsavel}` : ''}
                </p>
              </div>
              <IconButton
                icon={Trash2}
                variant="danger"
                label={`Remover ${e.nome}`}
                onClick={() => onRemover(i)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
