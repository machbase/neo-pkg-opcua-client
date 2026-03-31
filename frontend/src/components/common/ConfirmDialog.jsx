import { useEffect } from 'react'

export default function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{message}</div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-content btn-ghost">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-content btn-danger">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
