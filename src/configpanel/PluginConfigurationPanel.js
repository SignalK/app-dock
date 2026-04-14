import React, { useState, useRef, useCallback } from 'react'

const S = {
  root: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#333',
    padding: '16px 0'
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 10,
    marginTop: 24
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnPrimary: { background: '#3b82f6', color: '#fff' },
  btnSave: { background: '#10b981', color: '#fff' },
  btnDanger: { background: '#ef4444', color: '#fff', padding: '4px 10px', fontSize: 11 },
  status: { marginTop: 8, fontSize: 12, minHeight: 18 },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    marginBottom: 6,
    cursor: 'grab'
  },
  itemDisabled: { opacity: 0.4 },
  dragOver: { borderColor: '#3b82f6', background: '#eef4ff' },
  handle: {
    color: '#bbb',
    fontSize: 16,
    cursor: 'grab',
    userSelect: 'none',
    flexShrink: 0,
    width: 18,
    textAlign: 'center'
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e2e8f0',
    overflow: 'hidden',
    flexShrink: 0,
    fontSize: 18
  },
  iconImg: { width: '100%', height: '100%', objectFit: 'contain', padding: 5 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 600, color: '#333' },
  url: { fontSize: 10, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  toggle: { flexShrink: 0 },
  checkbox: { width: 16, height: 16, cursor: 'pointer', accentColor: '#3b82f6' },
  preview: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    padding: '12px 18px',
    background: 'rgba(30,30,32,0.85)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 18,
    margin: '16px auto',
    width: 'fit-content'
  },
  actions: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 },
  empty: { textAlign: 'center', padding: '30px 16px', color: '#999', fontSize: 13 },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: 500, color: '#555', width: 160, flexShrink: 0 },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    background: '#fff',
    color: '#333'
  },
  input: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    width: 80,
    background: '#fff',
    color: '#333'
  },
  checkboxField: { width: 16, height: 16, accentColor: '#3b82f6' },
  hint: { fontSize: 11, color: '#aaa', marginLeft: 8 }
}

function IconPreview({ icon, label, color, size }) {
  const sz = size || 36
  const style = {
    ...S.iconBox,
    width: sz,
    height: sz,
    borderRadius: sz * 0.22,
    ...(color ? { background: color } : {})
  }
  const iconVal = icon || ''
  if (iconVal.startsWith('/') || iconVal.startsWith('http')) {
    return (
      <div style={style}>
        <img
          src={iconVal}
          alt={label}
          style={{ ...S.iconImg, padding: sz * 0.12 }}
          onError={(e) => {
            e.target.style.display = 'none'
            e.target.parentNode.textContent = (label || '??').slice(0, 2).toUpperCase()
          }}
        />
      </div>
    )
  }
  return <div style={style}>{iconVal || (label || '??').slice(0, 2).toUpperCase()}</div>
}

function SelectField({ label, value, options, onChange, hint }) {
  return (
    <div style={S.fieldRow}>
      <span style={S.label}>{label}</span>
      <select style={S.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span style={S.hint}>{hint}</span>}
    </div>
  )
}

function NumberField({ label, value, onChange, hint }) {
  return (
    <div style={S.fieldRow}>
      <span style={S.label}>{label}</span>
      <input style={S.input} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span style={S.hint}>{hint}</span>}
    </div>
  )
}

function CheckboxField({ label, checked, onChange, hint }) {
  return (
    <div style={S.fieldRow}>
      <span style={S.label}>{label}</span>
      <input type="checkbox" style={S.checkboxField} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {hint && <span style={S.hint}>{hint}</span>}
    </div>
  )
}

export default function PluginConfigurationPanel({ configuration, save }) {
  const cfg = configuration || {}
  const [apps, setApps] = useState(() => cfg.apps || [])
  const [position, setPosition] = useState(cfg.position || 'bottom')
  const [triggerCorner, setTriggerCorner] = useState(cfg.triggerCorner || 'bottom-right')
  const [iframeMode, setIframeMode] = useState(cfg.iframeMode || 'keep-alive')
  const [iconSize, setIconSize] = useState(cfg.iconSize || 56)
  const [magnification, setMagnification] = useState(cfg.magnification !== false)
  const [magnificationScale, setMagnificationScale] = useState(cfg.magnificationScale || 1.7)
  const [showNightModeButton, setShowNightModeButton] = useState(cfg.showNightModeButton || false)
  const [showExitButton, setShowExitButton] = useState(cfg.showExitButton || false)

  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)

  const appsRef = useRef(apps)
  appsRef.current = apps

  const buildConfig = useCallback(
    (appsList) => ({
      position,
      triggerCorner,
      iframeMode,
      iconSize,
      magnification,
      magnificationScale,
      showNightModeButton,
      showExitButton,
      apps: appsList
    }),
    [
      position,
      triggerCorner,
      iframeMode,
      iconSize,
      magnification,
      magnificationScale,
      showNightModeButton,
      showExitButton
    ]
  )

  const doSave = useCallback(() => {
    save(buildConfig(apps))
    setStatus('Saved!')
    setStatusError(false)
  }, [apps, buildConfig, save])

  const discover = async () => {
    setDiscovering(true)
    setStatus('')
    setStatusError(false)
    try {
      const res = await fetch('/skServer/webapps')
      const allWebapps = await res.json()
      const webapps = allWebapps
        .filter((w) => w.name !== '@signalk/app-dock')
        .map((w) => {
          if (w.name === '@signalk/server-admin-ui') {
            return {
              name: w.name,
              label: 'Settings',
              url: '/admin/',
              icon: '/@signalk/app-dock/icon-settings.svg',
              isAdmin: true
            }
          }
          return {
            name: w.name,
            label: w.signalk?.displayName || w.name,
            url: `/${w.name}/`,
            icon: w.signalk?.appIcon ? `/${w.name}/${w.signalk.appIcon}` : null
          }
        })

      if (webapps.length === 0) {
        setStatus('No webapps found. Is the server fully started?')
        setStatusError(true)
        setDiscovering(false)
        return
      }

      const current = appsRef.current
      const existingUrls = new Set(current.map((a) => a.url))
      let added = 0
      const merged = [...current]
      for (const w of webapps) {
        if (!existingUrls.has(w.url)) {
          merged.push({
            enabled: true,
            autostart: false,
            url: w.url,
            label: w.label || '',
            icon: w.icon || '',
            color: w.isAdmin ? '#78788c' : ''
          })
          added++
        }
      }

      setApps(merged)
      setStatus(
        added > 0
          ? `Found ${webapps.length} webapps, added ${added} new.`
          : `All ${webapps.length} webapps already in list.`
      )
      setStatusError(false)
    } catch (e) {
      setStatus('Discovery failed: ' + e.message)
      setStatusError(true)
    }
    setDiscovering(false)
  }

  const toggleApp = (i) => setApps(apps.map((a, j) => (j === i ? { ...a, enabled: !a.enabled } : a)))
  const toggleAutostart = (i) =>
    setApps(apps.map((a, j) => (j === i ? { ...a, autostart: !a.autostart } : { ...a, autostart: false })))
  const removeApp = (i) => setApps(apps.filter((_, j) => j !== i))

  const onDragStart = (i) => setDragIdx(i)
  const onDragOver = (e, i) => {
    e.preventDefault()
    setOverIdx(i)
  }
  const onDragLeave = () => setOverIdx(null)
  const onDrop = (e, dropIdx) => {
    e.preventDefault()
    setOverIdx(null)
    if (dragIdx !== null && dragIdx !== dropIdx) {
      const next = [...apps]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(dropIdx, 0, moved)
      setApps(next)
    }
    setDragIdx(null)
  }
  const onDragEnd = () => {
    setDragIdx(null)
    setOverIdx(null)
  }

  const enabledApps = apps.filter((a) => a.enabled !== false)

  return (
    <div style={S.root}>
      <div style={S.sectionTitle}>Dock Settings</div>

      <SelectField
        label="Dock position"
        value={position}
        onChange={setPosition}
        options={[
          { value: 'bottom', label: 'Bottom' },
          { value: 'top', label: 'Top' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' }
        ]}
      />

      <SelectField
        label="Double-tap corner"
        value={triggerCorner}
        onChange={setTriggerCorner}
        options={[
          { value: 'bottom-right', label: 'Bottom-right' },
          { value: 'bottom-left', label: 'Bottom-left' },
          { value: 'top-right', label: 'Top-right' },
          { value: 'top-left', label: 'Top-left' }
        ]}
      />

      <SelectField
        label="iFrame lifecycle"
        value={iframeMode}
        onChange={setIframeMode}
        options={[
          { value: 'keep-alive', label: 'Keep-alive (faster switching, more RAM)' },
          { value: 'destroy', label: 'Destroy (reload each time, less RAM)' }
        ]}
      />

      <NumberField label="Icon size" value={iconSize} onChange={setIconSize} hint="px" />

      <CheckboxField label="Magnification effect" checked={magnification} onChange={setMagnification} />

      {magnification && (
        <NumberField
          label="Magnification scale"
          value={magnificationScale}
          onChange={setMagnificationScale}
          hint="1.0 - 2.5"
        />
      )}

      <div style={S.sectionTitle}>Utility Buttons</div>

      <CheckboxField
        label="Night/Day mode toggle"
        checked={showNightModeButton}
        onChange={setShowNightModeButton}
        hint="Sun/moon button to toggle environment.mode"
      />

      <CheckboxField
        label="Exit button"
        checked={showExitButton}
        onChange={setShowExitButton}
        hint="X button to return to Signal K admin UI"
      />

      <div style={S.sectionTitle}>Webapps</div>
      <button
        style={{ ...S.btn, ...S.btnPrimary, ...(discovering ? { opacity: 0.6 } : {}) }}
        onClick={discover}
        disabled={discovering}
      >
        {discovering ? 'Discovering\u2026' : 'Discover Installed Webapps'}
      </button>
      {status && <div style={{ ...S.status, color: statusError ? '#ef4444' : '#10b981' }}>{status}</div>}

      <div style={S.sectionTitle}>Dock Apps (drag to reorder)</div>
      {apps.length === 0 ? (
        <div style={S.empty}>No apps yet. Click Discover above.</div>
      ) : (
        <div>
          {apps.map((app, i) => (
            <div
              key={app.url + i}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={onDragEnd}
              style={{
                ...S.item,
                ...(app.enabled === false ? S.itemDisabled : {}),
                ...(overIdx === i ? S.dragOver : {}),
                ...(dragIdx === i ? { opacity: 0.4 } : {})
              }}
            >
              <span style={S.handle}>{'\u2261'}</span>
              <IconPreview icon={app.icon} label={app.label || app.url} color={app.color} />
              <div style={S.info}>
                <div style={S.name}>{app.label || app.url}</div>
                <div style={S.url}>{app.url}</div>
              </div>
              <div style={S.toggle} title="Enabled">
                <input
                  type="checkbox"
                  checked={app.enabled !== false}
                  onChange={() => toggleApp(i)}
                  style={S.checkbox}
                />
              </div>
              <div
                style={{
                  ...S.toggle,
                  cursor: 'pointer',
                  fontSize: 16,
                  opacity: app.autostart ? 1 : 0.25
                }}
                onClick={() => toggleAutostart(i)}
                title={app.autostart ? 'Autostart: ON (click to disable)' : 'Click to set as autostart app'}
              >
                {'\u25b6'}
              </div>
              <button style={{ ...S.btn, ...S.btnDanger }} onClick={() => removeApp(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {(enabledApps.length > 0 || showNightModeButton || showExitButton) && (
        <>
          <div style={S.sectionTitle}>Preview</div>
          <div style={S.preview}>
            {showNightModeButton && (
              <>
                <div
                  style={{
                    ...S.iconBox,
                    width: 40,
                    height: 40,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 20,
                    borderRadius: 10
                  }}
                >
                  {'\u2600\uFE0F'}
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', alignSelf: 'center' }} />
              </>
            )}
            {enabledApps.map((app, i) => (
              <IconPreview key={i} icon={app.icon} label={app.label || app.url} color={app.color} size={40} />
            ))}
            {showExitButton && (
              <>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', alignSelf: 'center' }} />
                <div
                  style={{
                    ...S.iconBox,
                    width: 40,
                    height: 40,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 16,
                    borderRadius: 10,
                    color: '#fff'
                  }}
                >
                  {'\u2715'}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div style={S.actions}>
        <button style={{ ...S.btn, ...S.btnSave }} onClick={doSave}>
          Save Configuration
        </button>
      </div>
    </div>
  )
}
