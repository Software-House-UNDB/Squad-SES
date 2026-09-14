import { useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import PageHeader from '../../components/layout/PageHeader.jsx'
import Tabs from '../../components/ui/Tabs.jsx'
import Chip from '../../components/ui/Chip.jsx'
import Pagination from '../../components/ui/Pagination.jsx'
import Toast from '../../components/ui/Toast.jsx'
import OficiosTable from './OficiosTable.jsx'
import RevisaoOficioModal from './RevisaoOficioModal.jsx'
import ConfirmarAprovacaoModal from './ConfirmarAprovacaoModal.jsx'
import ReprovarOficioModal from './ReprovarOficioModal.jsx'
import { mockOficios, STATUS, STATUS_LABEL } from '../../data/mockOficios.js'
import './oficios.css'

const PAGE_SIZE = 8

const TABS = [
  { value: 'progresso', label: 'Ofícios em Progresso' },
  { value: 'finalizados', label: 'Ofícios Finalizados' },
]

const CHIPS = [
  { value: 'todos', label: 'Todos' },
  { value: STATUS.EM_ANDAMENTO, label: STATUS_LABEL[STATUS.EM_ANDAMENTO] },
  { value: STATUS.APROVADO, label: STATUS_LABEL[STATUS.APROVADO] },
  { value: STATUS.REPROVADO, label: STATUS_LABEL[STATUS.REPROVADO] },
  { value: STATUS.ENCERRADO, label: STATUS_LABEL[STATUS.ENCERRADO] },
]

export default function OficiosLista() {
  const [oficios, setOficios] = useState(mockOficios)
  const [activeTab, setActiveTab] = useState('progresso')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedId, setSelectedId] = useState(null)
  const [stage, setStage] = useState(null) // null | 'review' | 'approve' | 'reject'
  const [toast, setToast] = useState(null)

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

  function updateFilterAnd(setter) {
    return (value) => {
      setter(value)
      setPage(1)
    }
  }

  function handleView(oficio) {
    setSelectedId(oficio.id)
    setStage('review')
  }

  function closeModal() {
    setStage(null)
    setSelectedId(null)
  }

  function handleConfirmApprove() {
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

  function handleConfirmReject(motivo) {
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
