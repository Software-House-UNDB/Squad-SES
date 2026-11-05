import { useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import PageHeader from '../../components/layout/PageHeader.tsx'
import Tabs, { type TabItem } from '../../components/ui/Tabs.tsx'
import Chip from '../../components/ui/Chip.tsx'
import Pagination from '../../components/ui/Pagination.tsx'
import Toast, { type ToastVariant } from '../../components/ui/Toast.tsx'
import OficiosTable from './OficiosTable.tsx'
import RevisaoOficioModal from './RevisaoOficioModal.tsx'
import ConfirmarAprovacaoModal from './ConfirmarAprovacaoModal.tsx'
import ReprovarOficioModal from './ReprovarOficioModal.tsx'
import { mockOficios, STATUS, STATUS_LABEL, type Oficio, type OficioStatus } from '../../data/mockOficios.ts'
import './oficios.css'

const PAGE_SIZE = 8

type ListTab = 'progresso' | 'finalizados'
type StatusFilter = 'todos' | OficioStatus
type Stage = 'review' | 'approve' | 'reject' | null

interface ToastState {
  variant: ToastVariant
  title: string
  message: string
  undo: () => void
}

const TABS: TabItem<ListTab>[] = [
  { value: 'progresso', label: 'Ofícios em Progresso' },
  { value: 'finalizados', label: 'Ofícios Finalizados' },
]

const CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: STATUS.EM_ANDAMENTO, label: STATUS_LABEL[STATUS.EM_ANDAMENTO] },
  { value: STATUS.APROVADO, label: STATUS_LABEL[STATUS.APROVADO] },
  { value: STATUS.REPROVADO, label: STATUS_LABEL[STATUS.REPROVADO] },
  { value: STATUS.ENCERRADO, label: STATUS_LABEL[STATUS.ENCERRADO] },
]

export default function OficiosLista() {
  const [oficios, setOficios] = useState<Oficio[]>(mockOficios)
  const [activeTab, setActiveTab] = useState<ListTab>('progresso')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return oficios.filter((oficio) => {
      const matchesTab =
        activeTab === 'progresso' ? oficio.status === STATUS.EM_ANDAMENTO : oficio.status !== STATUS.EM_ANDAMENTO
      const matchesStatus = statusFilter === 'todos' || oficio.status === statusFilter
      const matchesSearch =
        term === '' ||
        oficio.numero.toLowerCase().includes(term) ||
        oficio.supervisor.toLowerCase().includes(term)
      return matchesTab && matchesStatus && matchesSearch
    })
  }, [oficios, activeTab, statusFilter, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const selectedOficio = oficios.find((o) => o.id === selectedId) ?? null

  function updateFilterAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function handleView(oficio: Oficio) {
    setSelectedId(oficio.id)
    setStage('review')
  }

  function closeModal() {
    setStage(null)
    setSelectedId(null)
  }

  function handleConfirmApprove() {
    if (!selectedOficio) return
    const previousStatus = selectedOficio.status
    const numero = selectedOficio.numero
    const id = selectedOficio.id

    setOficios((list) => list.map((o) => (o.id === id ? { ...o, status: STATUS.APROVADO, motivoReprovacao: null } : o)))
    closeModal()
    setToast({
      variant: 'approved',
      title: 'Ofício Aprovado',
      message: `O ofício ${numero} foi aprovado com sucesso. A solicitação de envio do termo foi enviada à Instituição de Ensino.`,
      undo: () => setOficios((list) => list.map((o) => (o.id === id ? { ...o, status: previousStatus } : o))),
    })
  }

  function handleConfirmReject(motivo: string) {
    if (!selectedOficio) return
    const previousStatus = selectedOficio.status
    const numero = selectedOficio.numero
    const id = selectedOficio.id

    setOficios((list) =>
      list.map((o) => (o.id === id ? { ...o, status: STATUS.REPROVADO, motivoReprovacao: motivo } : o)),
    )
    closeModal()
    setToast({
      variant: 'rejected',
      title: 'Ofício Reprovado',
      message: `O ofício ${numero} foi reprovado. Uma solicitação de Retificação será enviada à Instituição de Ensino.`,
      undo: () =>
        setOficios((list) => list.map((o) => (o.id === id ? { ...o, status: previousStatus, motivoReprovacao: null } : o))),
    })
  }

  function handleUndo() {
    toast?.undo()
    setToast(null)
  }

  return (
    <>
      <PageHeader icon={FileText} title="Análise de Ofícios" breadcrumb={['Gerenciamento', 'Análise de Ofícios']} />

      <div className="oficios-toolbar">
        <Tabs items={TABS} value={activeTab} onChange={updateFilterAnd(setActiveTab)} />

        <label className="oficios-search">
          <Search size={16} strokeWidth={2} />
          <input
            type="search"
            placeholder="Buscar por número ou supervisor"
            value={search}
            onChange={(e) => updateFilterAnd(setSearch)(e.target.value)}
          />
        </label>
      </div>

      <div className="oficios-chips">
        {CHIPS.map((chip) => (
          <Chip key={chip.value} active={statusFilter === chip.value} onClick={() => updateFilterAnd(setStatusFilter)(chip.value)}>
            {chip.label}
          </Chip>
        ))}
      </div>

      <div className="oficios-card">
        <OficiosTable oficios={pageItems} onView={handleView} />
        <Pagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {stage === 'review' && selectedOficio && (
        <RevisaoOficioModal
          oficio={selectedOficio}
          onClose={closeModal}
          onRequestApprove={() => setStage('approve')}
          onRequestReject={() => setStage('reject')}
        />
      )}

      {stage === 'approve' && selectedOficio && (
        <ConfirmarAprovacaoModal oficio={selectedOficio} onBack={() => setStage('review')} onConfirm={handleConfirmApprove} />
      )}

      {stage === 'reject' && selectedOficio && (
        <ReprovarOficioModal oficio={selectedOficio} onClose={closeModal} onConfirm={handleConfirmReject} />
      )}

      {toast && (
        <Toast
          variant={toast.variant}
          title={toast.title}
          message={toast.message}
          onUndo={handleUndo}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
