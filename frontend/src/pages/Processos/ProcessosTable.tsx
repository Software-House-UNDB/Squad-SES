import StatusProcessoBadge from '../../components/ui/StatusProcessoBadge.tsx';
import type { ProcessoResumo } from '../../data/mockProcessos.ts';
import { formatarData } from '../../lib/data.ts';
import './processos.css';

const COLUNAS = ['N° do processo', 'Autor', 'Status', 'Estagiários', 'Enviado em', 'Concluído em'];

export default function ProcessosTable({ processos }: { processos: ProcessoResumo[] }) {
  if (processos.length === 0) {
    return <div className="processos-table__empty">Nenhum processo recebido ainda.</div>;
  }

  return (
    <div className="processos-table-wrap">
      <table className="processos-table">
        <thead>
          <tr>
            {COLUNAS.map((coluna) => (
              <th key={coluna}>{coluna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {processos.map((processo) => (
            <tr key={processo.id}>
              <td className="processos-table__numero">{processo.numero}</td>
              <td>{processo.autor}</td>
              <td>
                <StatusProcessoBadge status={processo.status} />
              </td>
              <td>{processo.qtdEstagiarios}</td>
              <td>{formatarData(processo.enviadoEm)}</td>
              <td>{formatarData(processo.concluidoEm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
