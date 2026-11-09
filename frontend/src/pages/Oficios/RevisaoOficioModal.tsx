import { useState, type ReactNode } from 'react';
import { Building2, Layers, Users, Download } from 'lucide-react';
import Modal from '../../components/ui/Modal.tsx';
import Tabs, { type TabItem } from '../../components/ui/Tabs.tsx';
import type {
  Grupo,
  Oficio,
  UnidadeOficio,
  EstruturaEstagio as Estrutura,
} from '../../data/mockOficios.ts';
import './oficios.css';

type RevisaoTab = 'unidade' | 'estrutura' | 'grupos';

const TABS: TabItem<RevisaoTab>[] = [
  { value: 'unidade', label: 'Dados de Unidade', icon: Building2 },
  { value: 'estrutura', label: 'Estrutura de Estágio', icon: Layers },
  { value: 'grupos', label: 'Grupos', icon: Users },
];

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{value}</span>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="field-group">
      <p className="panel__title">{title}</p>
      <div className="field-group__grid">{children}</div>
    </div>
  );
}

function DadosUnidade({ unidade }: { unidade: UnidadeOficio }) {
  return (
    <>
      <div className="panel">
        <FieldGroup title="Dados de Unidade">
          <Field label="Unidade Concedente" value={unidade.concedente} />
          <Field label="Setor" value={unidade.setor} />
          <Field label="Período" value={`${unidade.periodoInicio} a ${unidade.periodoFim}`} />
        </FieldGroup>
      </div>
      <div className="panel">
        <FieldGroup title="Seguro">
          <Field label="Apólice" value={unidade.seguro.apolice} />
          <Field label="Seguradora" value={unidade.seguro.seguradora} />
          <Field label="Vencimento" value={unidade.seguro.vencimento} />
        </FieldGroup>
      </div>
    </>
  );
}

function EstruturaEstagio({ estrutura }: { estrutura: Estrutura }) {
  return (
    <>
      <div className="panel">
        <FieldGroup title="Estrutura de Estágio">
          <Field label="N° Grupos" value={estrutura.grupos} />
          <Field label="N° Alunos" value={estrutura.alunos} />
          <Field label="Turno" value={estrutura.turno} />
          <Field label="Dias da Semana" value={estrutura.diasSemana} />
          <Field label="Horário" value={estrutura.horario} />
          <Field label="Período" value={`${estrutura.periodoInicio} a ${estrutura.periodoFim}`} />
        </FieldGroup>
      </div>
      <div className="panel">
        <FieldGroup title="Carga Horária">
          <Field label="Semanas" value={estrutura.semanas} />
          <Field label="Carga Horária Semanal" value={estrutura.cargaSemanal} />
          <Field label="Carga Horária Total" value={estrutura.cargaTotal} />
        </FieldGroup>
      </div>
    </>
  );
}

function Grupos({ grupos }: { grupos: Grupo[] }) {
  return (
    <div className="grupos">
      {grupos.map((grupo) => (
        <div className="panel" key={grupo.nome}>
          <p className="panel__title">{grupo.nome}</p>
          <div className="grupo__alunos">
            {grupo.alunos.map((aluno) => (
              <div className="aluno-row" key={aluno.matricula}>
                <p className="aluno-row__nome">{aluno.nome}</p>
                <p className="aluno-row__detalhe">
                  CPF: {aluno.cpf} • Matrícula: {aluno.matricula}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Modal de revisão do ofício — "Revisão de Dados do Ofício" no Figma.
 * Decide entre abrir o passo de aprovação ou o de reprovação.
 */
interface RevisaoOficioModalProps {
  oficio: Oficio;
  onClose: () => void;
  onRequestApprove: () => void;
  onRequestReject: () => void;
}

export default function RevisaoOficioModal({
  oficio,
  onClose,
  onRequestApprove,
  onRequestReject,
}: RevisaoOficioModalProps) {
  const [activeTab, setActiveTab] = useState<RevisaoTab>('unidade');

  return (
    <Modal
      title={oficio.numero}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={onRequestReject}>
            Reprovar Ofício
          </button>
          <button type="button" className="btn-approve" onClick={onRequestApprove}>
            Aprovar Ofício
          </button>
        </>
      }
    >
      <div className="revisao">
        <div className="revisao__head">
          <h3 className="revisao__title">Revisão de Dados do Ofício</h3>
          <button type="button" className="btn-secondary revisao__download">
            <Download size={15} />
            Baixar Documentos
          </button>
        </div>

        <Tabs items={TABS} value={activeTab} onChange={setActiveTab} />

        <div className="revisao__panel">
          {activeTab === 'unidade' && <DadosUnidade unidade={oficio.unidade} />}
          {activeTab === 'estrutura' && <EstruturaEstagio estrutura={oficio.estrutura} />}
          {activeTab === 'grupos' && <Grupos grupos={oficio.grupos} />}
        </div>
      </div>
    </Modal>
  );
}
