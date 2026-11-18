import { Circle, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { agruparDocumentos, DECISAO_LABEL, type DecisaoDoc, type DocumentoAnalise } from './analise.ts';

const ICONE: Record<DecisaoDoc, LucideIcon> = {
  pendente: Circle,
  aprovado: CircleCheck,
  pendencia: TriangleAlert,
};

interface Props {
  documentos: DocumentoAnalise[];
  selecionadoId: string;
  onSelecionar: (id: string) => void;
}

/** Documentos do pacote, agrupados (do processo e de cada estagiário), com a decisão de cada um. */
export default function ListaDocumentos({ documentos, selecionadoId, onSelecionar }: Props) {
  return (
    <nav className="ap-lista" aria-label="Documentos do processo">
      {agruparDocumentos(documentos).map((grupo) => (
        <div key={grupo.titulo} className="ap-grupo" role="group" aria-label={grupo.titulo}>
          <p className="ap-grupo__titulo">{grupo.titulo}</p>
          <ul className="ap-grupo__itens">
            {grupo.documentos.map((d) => {
              const Icone = ICONE[d.decisao];
              const ativo = d.id === selecionadoId;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`ap-item ap-item--${d.decisao}${ativo ? ' ap-item--ativo' : ''}`}
                    aria-current={ativo ? 'true' : undefined}
                    aria-label={`${d.rotulo}${d.estagiario ? ` — ${d.estagiario}` : ''}, ${DECISAO_LABEL[d.decisao].toLowerCase()}`}
                    onClick={() => onSelecionar(d.id)}
                  >
                    <Icone size={18} className="ap-item__icone" aria-hidden="true" />
                    <span className="ap-item__texto">{d.rotulo}</span>
                    <span className="ap-item__estado" aria-hidden="true">
                      {DECISAO_LABEL[d.decisao]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
