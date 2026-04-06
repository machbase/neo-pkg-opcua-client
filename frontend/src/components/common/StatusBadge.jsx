const variants = {
  running: {
    dot: 'bg-success',
    badge: 'badge-success',
    label: 'Running',
    showDot: true,
  },
  stopped: {
    badge: 'badge-error',
    label: 'Stopped',
    showDot: false,
  },
}

export default function StatusBadge({ status }) {
  const v = variants[status] || variants.stopped
  return (
    <span className={`badge ${v.badge} uppercase tracking-wide select-none`}>
      {v.showDot && <span className={`block w-1.5 h-1.5 rounded-full shrink-0 ${v.dot}`} />}
      {v.label}
    </span>
  )
}
