import Icon from '../common/Icon'

// Collector-level collection policies. Each policy is a two-way choice whose consequence has
// to be read to be judged, so both outcomes split one row under the label. Every option
// carries its own helper — never just the selected one.
// Exported so the read-only detail view describes the selected option with the same wording.
export const POLICIES = [
  {
    key: 'timePolicy',
    label: 'Time Policy',
    shortLabel: 'Time Policy',
    icon: 'schedule',
    fallback: 'sourceTime',
    options: [
      {
        value: 'sourceTime',
        help: "Prefer the node's sourceTimestamp, fall back to the request time",
      },
      {
        value: 'requestTime',
        help: 'Stamp every tag with the time the server was read',
      },
    ],
  },
  {
    key: 'badStatusPolicy',
    label: 'Bad Status Policy',
    shortLabel: 'Bad Status',
    icon: 'verified_user',
    fallback: 'skip',
    options: [
      {
        value: 'skip',
        help: 'Do not store the value · derived tags apply their onError policy',
      },
      {
        value: 'ignore',
        help: 'Store the value regardless of its quality',
      },
    ],
  },
]

function PolicyRow({ policy, value, onChange }) {
  return (
    <div>
      <label className="form-label">{policy.label}</label>
      <div className="policy-options" role="radiogroup" aria-label={policy.label}>
        {policy.options.map((opt) => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`policy-option${selected ? ' is-selected' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              <span className="policy-option-radio" />
              <span className="min-w-0">
                <span className="policy-option-name block">{opt.value}</span>
                <span className="policy-option-help block">{opt.help}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CollectionPolicyCard({ form, update }) {
  return (
    <div className="form-card">
      <div className="form-card-header">
        <span className="section-dot" />
        Collection Policy
        <Icon name="schedule" className="ml-auto text-primary" />
      </div>

      <div className="space-y-16">
        {POLICIES.map((policy) => (
          <PolicyRow
            key={policy.key}
            policy={policy}
            value={form[policy.key] || policy.fallback}
            onChange={(v) => update(policy.key, v)}
          />
        ))}
      </div>
    </div>
  )
}
