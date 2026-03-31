import Icon from '../common/Icon'

export default function LogSection({ form, update }) {
  const showFile = form.log.output === 'file' || form.log.output === 'both'

  return (
    <div className="form-card">
      <div className="form-card-header">
        <Icon name="description" className="text-primary" />
        Logging Controls
      </div>

      <div className="space-y-6">
        <div>
          <label className="form-label">Log Verbosity</label>
          <select
            value={form.log.level}
            onChange={e => update('log.level', e.target.value)}
            className="w-full"
          >
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>

        <div>
          <label className="form-label">Output Stream</label>
          <select
            value={form.log.output}
            onChange={e => update('log.output', e.target.value)}
            className="w-full"
          >
            <option value="console">Standard Out / Console</option>
            <option value="file">File Only</option>
            <option value="both">Console + File</option>
          </select>
        </div>

        <div>
          <label className="form-label">Payload Format</label>
          <select
            value={form.log.format}
            onChange={e => update('log.format', e.target.value)}
            className="w-full"
          >
            <option value="json">JSON (Structured)</option>
            <option value="text">Plain Text</option>
          </select>
        </div>

        {showFile && (
          <div className="space-y-4 pt-3 border-t border-border">
            <div>
              <label className="form-label">File Path</label>
              <input
                type="text"
                required={showFile}
                value={form.log.file.path}
                onChange={e => update('log.file.path', e.target.value)}
                className="w-full"
                placeholder="./logs/collector-a.log"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="form-label">Max Size</label>
                <input
                  type="text"
                  value={form.log.file.maxSize}
                  onChange={e => update('log.file.maxSize', e.target.value)}
                  className="w-full"
                  placeholder="10MB"
                />
              </div>
              <div>
                <label className="form-label">Max Files</label>
                <input
                  type="number"
                  min="1"
                  value={form.log.file.maxFiles}
                  onChange={e => update('log.file.maxFiles', e.target.value)}
                  className="w-full"
                  placeholder="7"
                />
              </div>
              <div>
                <label className="form-label">Rotate</label>
                <select
                  value={form.log.file.rotate}
                  onChange={e => update('log.file.rotate', e.target.value)}
                  className="w-full"
                >
                  <option value="size">Size</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
