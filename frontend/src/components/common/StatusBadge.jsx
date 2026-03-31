const variants = {
  running: {
    dot: 'bg-success',
    badge: 'border-success/30 bg-success-muted text-success',
    label: 'Running',
    showDot: true,
  },
  stopped: {
    badge: 'border-border bg-surface-elevated text-on-surface-disabled',
    label: 'Stopped',
    showDot: false,
  },
}

export default function StatusBadge({ status }) {
  const v = variants[status] || variants.stopped
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-base border text-sm font-medium uppercase tracking-wide select-none ${v.badge}`}>
      {v.showDot && <span className={`block w-1.5 h-1.5 rounded-full shrink-0 ${v.dot}`} />}
      {v.label}
    </span>
  )
}
