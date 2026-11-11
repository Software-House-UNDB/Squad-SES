import { FileCheck2, FolderOpen } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import ArquivoSlot, { type Arquivo } from './ArquivoSlot.tsx';
import { DOCS_DO_PROCESSO, docsDoEstagiario } from './pacote.ts';
import type { EstagiarioForm } from './validacao.ts';

interface Props {
  estagiarios: EstagiarioForm[];
  anexos: Record<string, Arquivo>;
  errosArquivo: Record<string, string>;
  /** Total de documentos exigidos e quantos já foram anexados. */
  total: number;
  completos: number;
  id: (nome: string) => string;
  onAnexar: (chave: string, arquivo: File) => void;
  onRemover: (chave: string) => void;
}

/** Card "Pacote de documentos": docs do processo + docs de cada estagiário. */
export default function PacoteDocumentos({
  estagiarios,
  anexos,
  errosArquivo,
  total,
  completos,
  id,
  onAnexar,
  onRemover,
}: Props) {
  return (
    <section className="np-card" aria-labelledby={id('doc-titulo')}>
      <header className="np-card__head">
        <span className="np-card__icon">
          <FolderOpen size={18} />
        </span>
        <div>
          <h2 className="np-card__title" id={id('doc-titulo')}>
            Pacote de documentos
          </h2>
          <p className="np-card__hint">Somente PDF, até 20 MB por arquivo. Cada documento precisa de um arquivo diferente.</p>
        </div>
        <Badge variant={total > 0 && completos === total ? 'approved' : 'neutral'}>
          {completos} de {total}
        </Badge>
      </header>

      <h3 className="np-subtitulo">Do processo</h3>
      <ul className="np-slots">
        {/* RF-10: o TCE é gerado pelo sistema e nunca é anexado pelo representante. */}
        <li className="np-slot np-slot--gerado">
          <div className="np-slot__linha">
            <span className="np-slot__estado" aria-hidden="true">
              <FileCheck2 size={18} />
            </span>
            <span className="np-slot__rotulo">
              Termo de compromisso de estágio (TCE)
              <span className="np-slot__nota">
                Criado pelo sistema com o modelo da SES (Portaria 1327). Você não precisa anexar.
              </span>
            </span>
            <Badge variant="neutral">Gerado pelo sistema</Badge>
          </div>
        </li>
        {DOCS_DO_PROCESSO.map((d) => (
          <ArquivoSlot
            key={d.chave}
            rotulo={d.rotulo}
            arquivo={anexos[d.chave]}
            erro={errosArquivo[d.chave]}
            onEscolher={(f) => onAnexar(d.chave, f)}
            onRemover={() => onRemover(d.chave)}
          />
        ))}
      </ul>

      <h3 className="np-subtitulo">De cada estagiário</h3>
      {estagiarios.length === 0 ? (
        <p className="np-vazio">Adicione estagiários ao lote para anexar os documentos de cada um.</p>
      ) : (
        estagiarios.map((e) => (
          <div key={e.cpf} className="np-grupo">
            <p className="np-grupo__nome">{e.nome}</p>
            <ul className="np-slots">
              {docsDoEstagiario(e.cpf, e.menor).map((d) => (
                <ArquivoSlot
                  key={d.chave}
                  rotulo={d.rotulo}
                  arquivo={anexos[d.chave]}
                  erro={errosArquivo[d.chave]}
                  onEscolher={(f) => onAnexar(d.chave, f)}
                  onRemover={() => onRemover(d.chave)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
