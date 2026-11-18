import { FolderOpen } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader.tsx';
import { mockProcessos } from '../../data/mockProcessos.ts';
import ProcessosTable from './ProcessosTable.tsx';
import './processos.css';

// Esqueleto (RF-20): sem filtros, busca, paginação, contadores nem API. Entram nas Sprints 2 e 4.
export default function ListaProcessos() {
  return (
    <>
      <PageHeader icon={FolderOpen} title="Processos" breadcrumb={['Gerenciamento', 'Processos']} />
      <div className="processos-card">
        <ProcessosTable processos={mockProcessos} />
      </div>
    </>
  );
}
