import { TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import './oficios.css'

/** Passo de confirmação antes de efetivar a aprovação — ação irreversível. */
export default function ConfirmarAprovacaoModal({ oficio, onBack, onConfirm }) {
  return (
    <Modal
      title="Confirmar aprovação do ofício"
      onClose={onBack}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onBack}>
            Voltar
          </button>
          <button type="button" className="btn-approve" onClick={onConfirm}>
            Confirmar Aprovação
          </button>
        </>
      }
    >
      <div className="info-banner">
        <TriangleAlert size={18} className="info-banner__icon" />
        <p>
          Você está prestes a aprovar o ofício <strong>{oficio.numero}</strong>. Esta ação registrará a
          aprovação e não poderá ser desfeita.
        </p>
      </div>
    </Modal>
  )
}
