import { Plus, SquarePen, Eye, Share2, Trash2, ArrowDownUp } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import IconButton from '../../components/ui/IconButton.tsx';
import { STATUS_LABEL, STATUS_VARIANT, type Oficio } from '../../data/mockOficios.ts';
import './oficios.css';

interface OficiosTableProps {
  oficios: Oficio[];
  onView: (oficio: Oficio) => void;
}

const COLUMNS = ['N° do Ofício', 'Supervisor', 'Data', 'Status', 'Operador', 'ETA'];

export default function OficiosTable({ oficios, onView }: OficiosTableProps) {
  if (oficios.length === 0) {
    return (
      <div className="oficios-table__empty">
        Nenhum ofício encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="oficios-table-wrap">
      <table className="oficios-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col}>
                <span className="oficios-table__th">
                  {col}
                  <ArrowDownUp size={12} strokeWidth={2} />
                </span>
              </th>
            ))}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {oficios.map((oficio) => (
            <tr key={oficio.id}>
              <td className="oficios-table__numero">{oficio.numero}</td>
              <td>{oficio.supervisor}</td>
              <td>{oficio.data}</td>
              <td>
                <Badge variant={STATUS_VARIANT[oficio.status]}>{STATUS_LABEL[oficio.status]}</Badge>
              </td>
              <td>{oficio.operador}</td>
              <td>{oficio.eta}</td>
              <td>
                <div className="oficios-table__actions">
                  <IconButton icon={Plus} label="Adicionar" disabled />
                  <IconButton icon={SquarePen} label="Editar" disabled />
                  <IconButton
                    icon={Eye}
                    label="Analisar ofício"
                    variant="primary"
                    onClick={() => onView(oficio)}
                  />
                  <IconButton icon={Share2} label="Compartilhar" disabled />
                  <IconButton icon={Trash2} label="Excluir" variant="danger" disabled />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
