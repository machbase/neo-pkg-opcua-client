import { useEffect } from 'react'
import Icon from './Icon'

export default function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
}) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <Icon name="warning" className="text-warning" />
            {title}
          </div>
          <button
            onClick={onCancel}
            className="p-4 hover:bg-surface-hover rounded-base tooltip"
            data-tooltip="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <p className="text-base text-on-surface-secondary">{message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={onConfirm} className={`btn btn-${confirmVariant}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
