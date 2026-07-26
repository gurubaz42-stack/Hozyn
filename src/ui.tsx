// Shared UI primitives — modals, inputs, tables, badges
// No heavy dependencies — keeps every lazy chunk small

export function Modal({ title, onClose, children, maxWidth = 640 }: {
  title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(13,31,64,0.2)' }}>
        <div style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0D1F40', borderRadius: '12px 12px 0 0' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: 'white' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="erp-label">{label}</label>
      {children}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'status-available', occupied: 'status-occupied', reserved: 'status-reserved',
    maintenance: 'status-maintenance', cleaning: 'status-cleaning',
    confirmed: 'status-confirmed', checked_in: 'status-checked-in',
    checked_out: 'status-checked-out', cancelled: 'status-cancelled', pending: 'status-pending',
    delivered: 'status-checked-in', preparing: 'status-reserved', ready: 'status-confirmed',
    clean: 'status-available', dirty: 'status-occupied', in_progress: 'status-reserved',
    inspected: 'status-confirmed', active: 'status-checked-in', inactive: 'status-occupied',
  }
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span className={map[status] || ''} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
      {label}
    </span>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

// Inline SVG bar chart — zero deps
export function BarChartSVG({ data, height = 160, color = '#C9A84C', valueLabel = (v: number) => String(v) }: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  valueLabel?: (v: number) => string
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  const w = 100 / data.length
  return (
    <svg viewBox={`0 0 ${data.length * 48} ${height + 32}`} style={{ width: '100%', height: height + 32 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, (d.value / max) * height)
        const x = i * 48 + 4
        const y = height - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={40} height={barH} rx={4} fill={color} opacity={0.85} />
            <text x={x + 20} y={height + 14} textAnchor="middle" fontSize={10} fill="#94A3B8">{d.label}</text>
            <text x={x + 20} y={y - 4} textAnchor="middle" fontSize={9} fill="#64748B">{valueLabel(d.value)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Inline SVG area/line chart
export function AreaChartSVG({ data, height = 160, color = '#0D1F40', valueLabel = (v: number) => String(v) }: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  valueLabel?: (v: number) => string
}) {
  const W = 480
  const max = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (W - 40) + 20
    const y = height - (d.value / max) * (height - 16)
    return { x, y, ...d }
  })
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = pathD + ` L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z`
  return (
    <svg viewBox={`0 0 ${W} ${height + 24}`} style={{ width: '100%', height: height + 24 }}>
      <defs>
        <linearGradient id={`ag-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={20} y1={height - t * (height - 16)} x2={W - 20} y2={height - t * (height - 16)} stroke="#F1F5F9" strokeWidth={1} />
      ))}
      <path d={areaD} fill={`url(#ag-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} />
          <text x={p.x} y={height + 16} textAnchor="middle" fontSize={10} fill="#94A3B8">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

// Inline SVG donut chart
export function DonutChartSVG({ data, size = 120 }: {
  data: { name: string; value: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2
  let angle = -90
  const slices = data.map(d => {
    const sweep = (d.value / total) * 360
    const start = angle
    angle += sweep
    return { ...d, start, sweep }
  })
  const arc = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x1 = cx + r * Math.cos(toRad(startDeg))
    const y1 = cy + r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg))
    const y2 = cy + r * Math.sin(toRad(endDeg))
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
      {slices.map((s, i) => (
        <path key={i} d={arc(cx, cy, r, s.start, s.start + s.sweep - 1)} fill={s.color} opacity={0.9} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight="700" fill="#0D1F40">{total}</text>
    </svg>
  )
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <div style={{ fontSize: 13, color: '#94A3B8' }}>{label}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export function ErrorBanner({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div style={{ margin: 24, padding: 18, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', marginBottom: 2 }}>Failed to load data</div>
        <div style={{ fontSize: 12, color: '#EF4444', fontFamily: 'monospace' }}>{msg}</div>
      </div>
      {onRetry && <button onClick={onRetry} style={{ padding: '7px 14px', background: '#0D1F40', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Retry</button>}
    </div>
  )
}

import React from 'react'
