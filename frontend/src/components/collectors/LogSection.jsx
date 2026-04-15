import Icon from '../common/Icon'

const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']

export default function LogSection({ form, update }) {
  const currentIdx = LOG_LEVELS.indexOf(form.log.level)
  const included = currentIdx >= 0 ? LOG_LEVELS.slice(currentIdx) : []

  return (
    <div className="form-card log-compact">
      <div className="form-card-header !mb-0">
        <Icon name="terminal" className="text-primary" />
        Logging Controls
      </div>
      <div className="flex items-center gap-24">
        <div className="flex items-center gap-12">
          <div className="flex flex-col items-end">
            <label className="form-label !mb-0">Log Level</label>
            <span className="log-level-caption">
              {included.length > 0 ? (
                <>
                  Records{' '}
                  {included.map((lv, i) => (
                    <span key={lv} className={`log-level-tag level-${lv.toLowerCase()}`}>
                      {lv}
                      {i < included.length - 1 ? ', ' : ''}
                    </span>
                  ))}{' '}
                  messages
                </>
              ) : (
                'Select a threshold level'
              )}
            </span>
          </div>
          <div className="log-level-group" role="radiogroup" aria-label="Log Level">
            {LOG_LEVELS.map((lv, i) => {
              const state =
                currentIdx < 0
                  ? 'excluded'
                  : i < currentIdx
                    ? 'excluded'
                    : i === currentIdx
                      ? 'selected'
                      : 'included'
              return (
                <button
                  key={lv}
                  type="button"
                  role="radio"
                  aria-checked={i === currentIdx}
                  onClick={() => update('log.level', lv)}
                  className={`log-level-item level-${lv.toLowerCase()} is-${state}`}
                >
                  {lv}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-12">
          <label className="form-label !mb-0">File Limit</label>
          <input
            type="number"
            min="1"
            value={form.log.file.maxFiles}
            onChange={e => update('log.file.maxFiles', e.target.value)}
            className="w-[100px]"
            placeholder="7"
          />
        </div>
      </div>
    </div>
  )
}
