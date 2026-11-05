import type { LucideIcon } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.tsx';
import './Placeholder.css';

interface PlaceholderProps {
  icon: LucideIcon;
  title: string;
  breadcrumb: string[];
}

/** Tela reservada para seções do menu que ainda não têm fluxo implementado. */
export default function Placeholder({ icon, title, breadcrumb }: PlaceholderProps) {
  return (
    <>
      <PageHeader icon={icon} title={title} breadcrumb={breadcrumb} />
      <div className="placeholder-card">
        <p>Esta seção ainda não foi implementada.</p>
      </div>
    </>
  );
}
