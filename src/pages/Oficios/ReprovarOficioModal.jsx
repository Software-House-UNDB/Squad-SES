import { useState } from 'react'
import Modal from '../../components/ui/Modal.jsx'
import '../../styles/forms.css'
import './oficios.css'

/** Passo de reprovação — exige o motivo antes de confirmar. */
export default function ReprovarOficioModal({ oficio, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState('')
  const [touched, setTouched] = useState(false)

  const isValid = motivo.trim().length > 0

  function handleConfirm() {
    if (!isValid) {
      setTouched(true)
      return
    }
    onConfirm(motivo.trim())
  }

  return (
    <Modal
      title="Reprovar Ofício"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={handleConfirm} disabled={!isValid}>
            Reprovar Ofício
          </button>
        </>
      }
    >
      <div className="form-field">
        <label htmlFor="motivo-reprovacao">Digite o motivo de reprovação do Ofício:</label>
        <textarea
          id="motivo-reprovacao"
          className="oficios-textarea"
          rows={4}
          placeholder={`Descreva o que precisa ser corrigido no ofício ${oficio.numero}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {touched && !isValid && <span className="form-error">Informe o motivo antes de reprovar.</span>}
      </div>
    </Modal>
  )
}
