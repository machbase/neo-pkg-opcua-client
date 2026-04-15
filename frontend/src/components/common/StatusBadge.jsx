const variants = {
  running: {
    badge: 'border-success/30 bg-success-muted text-success',
    label: 'Running',
  },
  stopped: {
    badge: 'border-error/30 bg-error-muted text-error',
    label: 'Stopped',
  },
}

export default function StatusBadge({ status }) {
  const v = variants[status] || variants.stopped
  return (
    <span className={`inline-flex items-center gap-6 px-10 py-4 rounded-base border text-sm font-medium uppercase tracking-wide select-none ${v.badge}`}>
      {v.label}
    </span>
  )
}
