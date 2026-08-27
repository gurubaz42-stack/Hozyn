import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import { useOrderNotification } from './lib/useOrderNotification'
import { useNotifications, type AppNotification } from './lib/useNotifications'

interface LoggedInUser {
  id: string
  employee_name: string
  role_name: string | null
  department: string | null
  login_id: string
  permissions: string[]
}

// ─── Lazy module chunks — each loads only when navigated to ──────────────────
const Dashboard    = lazy(() => import('./modules/Dashboard'))
const Guests       = lazy(() => import('./modules/Guests'))
const Rooms        = lazy(() => import('./modules/Rooms'))
const Reservations = lazy(() => import('./modules/Reservations'))
const Restaurant   = lazy(() => import('./modules/Restaurant'))
const Services     = lazy(() => import('./modules/Services'))
const Checkout     = lazy(() => import('./modules/Checkout'))
const Reports      = lazy(() => import('./modules/Reports'))
const Employees    = lazy(() => import('./modules/Employees'))
const Settings     = lazy(() => import('./modules/Settings'))
const Invoices     = lazy(() => import('./modules/Invoices'))

// ─── Nav config ───────────────────────────────────────────────────────────────

const nav = [
  { id: 'dashboard',    label: 'Dashboard',        icon: '⊞' },
  { id: 'guests',       label: 'Guest Management', icon: '👥' },
  { id: 'rooms',        label: 'Room Management',  icon: '🛏' },
  { id: 'reservations', label: 'Reservations',     icon: '📅' },
  { id: 'restaurant',   label: 'Restaurant POS',   icon: '🍽️' },
  { id: 'services',    label: 'Services',          icon: '🛎️' },
  { id: 'checkout',     label: 'Checkout',         icon: '🧾' },
  { id: 'reports',      label: 'Reports',          icon: '📊' },
  { id: 'employees',    label: 'Employees',        icon: '👤' },
  { id: 'invoices',     label: 'Invoices',         icon: '🧾' },
  { id: 'settings',     label: 'Settings',         icon: '⚙️' },
]

function ActiveModule({ id, onNavigate, currentUser, checkoutResId, guestsAutoAdd, settingsInitial }: {
  id: string
  onNavigate: (m: string, resId?: string, action?: string) => void
  currentUser: LoggedInUser
  checkoutResId?: string
  guestsAutoAdd?: boolean
  settingsInitial?: { tab?: string; goType?: string }
}) {
  switch (id) {
    case 'dashboard':    return <Dashboard onNavigate={onNavigate} />
    case 'guests':       return <Guests autoOpenAdd={guestsAutoAdd} onNavigate={onNavigate} />
    case 'rooms':        return <Rooms />
    case 'reservations': return <Reservations onNavigate={onNavigate} />
    case 'restaurant':   return <Restaurant />
    case 'services':     return <Services />
    case 'checkout':     return <Checkout key={checkoutResId || 'checkout-default'} initialResId={checkoutResId} />
    case 'reports':      return <Reports />
    case 'employees':    return <Employees currentUser={currentUser} />
    case 'invoices':     return <Invoices />
    case 'settings':     return <Settings key={settingsInitial?.tab || 'settings'} initialTab={settingsInitial?.tab} initialGoType={settingsInitial?.goType as 'nationality' | 'category' | 'state' | undefined} />
    default:             return null
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ active, onChange, collapsed, onToggle, permissions }: {
  active: string; onChange: (m: string) => void; collapsed: boolean; onToggle: () => void; permissions: string[]
}) {
  const hasAll = permissions.includes('all')
  const visibleNav = nav.filter(item => hasAll || permissions.includes(item.id))

  return (
    <aside style={{
      width: collapsed ? 62 : 234, background: '#0D1F40', display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'fixed', left: 0, top: 0, transition: 'width 0.2s ease', zIndex: 40, overflowX: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '12px 0' : '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10, minHeight: 64 }}>
        {/* Logo on white pill — multiply blend removes white on dark bg */}
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, margin: collapsed ? '0 auto' : 0, padding: 3, boxShadow: '0 0 0 1px rgba(201,168,76,0.3)' }}>
          <img src="/src/imports/HOZYN_LOGO.png" alt="HoZyn" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 13, fontFamily: "'Playfair Display', serif" }}>HoZyn</div>
            <div style={{ color: '#C9A84C', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hotel ERP</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 7px' }}>
        {visibleNav.map(item => (
          <div key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)} title={collapsed ? item.label : ''}
            style={{ justifyContent: collapsed ? 'center' : 'flex-start', borderLeft: active === item.id && !collapsed ? '3px solid #C9A84C' : '3px solid transparent' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: '10px 7px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="nav-item" onClick={onToggle} style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <span style={{ fontSize: 16 }}>{collapsed ? '▶' : '◀'}</span>
          {!collapsed && <span>Collapse</span>}
        </div>
      </div>
    </aside>
  )
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ module, user, onLogout, notifications, unread, muted, toggleMute, markAllRead, clearAll, ICONS }: {
  module: string; user: LoggedInUser | null; onLogout: () => void
  notifications: AppNotification[]; unread: number; muted: boolean
  toggleMute: () => void; markAllRead: () => void; clearAll: () => void
  ICONS: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const label = nav.find(n => n.id === module)?.label || module

  if (!user || typeof user !== 'object' || !user.employee_name) return (
    <header style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 22px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>{label}</div>
      <button className="btn-ghost" onClick={onLogout} style={{ padding: '6px 11px', fontSize: 12.5 }}>🚪 Logout</button>
    </header>
  )
  const initials = user.employee_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <header style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 22px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>HoZyn Hotel ERP &bull; {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}
            style={{ background: open ? '#F1F5F9' : 'none', border: '1.5px solid', borderColor: open ? '#E2E8F0' : 'transparent', cursor: 'pointer', padding: '5px 8px', borderRadius: 8, position: 'relative', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            {muted ? '🔕' : '🔔'}
            {unread > 0 && !open && (
              <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, background: '#EF4444', borderRadius: 8, border: '1.5px solid white', fontSize: 9, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {open && (
            <div style={{ position: 'absolute', top: 44, right: 0, width: 360, background: 'white', borderRadius: 12, boxShadow: '0 16px 48px rgba(13,31,64,0.18)', border: '1px solid #E2E8F0', zIndex: 999, overflow: 'hidden' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding: '12px 16px', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'Playfair Display',serif", color: 'white', fontWeight: 700, fontSize: 14 }}>Notifications {unread > 0 && <span style={{ fontSize: 11, color: '#C9A84C' }}>({unread} new)</span>}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
                    style={{ background: muted ? '#334155' : '#1E3A5F', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', color: 'white', fontSize: 13, padding: '3px 8px', fontWeight: 600 }}>
                    {muted ? '🔕 Unmute' : '🔔 Mute'}
                  </button>
                  {notifications.length > 0 && (
                    <button onClick={clearAll} title="Clear all"
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', color: '#94A3B8', fontSize: 11, padding: '3px 8px' }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {notifications.length === 0
                  ? <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                      No notifications yet
                    </div>
                  : notifications.map(n => (
                    <div key={n.id} style={{ display: 'flex', gap: 12, padding: '11px 16px', borderBottom: '1px solid #F1F5F9', background: n.read ? 'white' : '#FFFBEB', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{ICONS[n.type]}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1F40' }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                        <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 4 }}>
                          {n.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} &bull; {n.at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9A84C', flexShrink: 0, marginTop: 5 }} />}
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Close panel on outside click */}
        {open && <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#F8F9FC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 11, fontWeight: 700 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{user.employee_name}</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>{user.role_name || user.department || `@${user.login_id}`}</div>
          </div>
        </div>
        <button className="btn-ghost" onClick={onLogout} style={{ padding: '6px 11px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
          🚪 Logout
        </button>
      </div>
    </header>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (user: LoggedInUser) => void }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // If session exists when Login mounts (race between HMR and state), auto-restore
  useEffect(() => {
    const saved = readSession()
    if (saved) onLogin(saved)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginId.trim() || !password.trim()) return
    setLoading(true); setLoginError(null)

    const { data, error } = await supabase
      .from('employees')
      .select('id, employee_name, login_id, is_active, roles(role_name, department, permissions)')
      .eq('login_id', loginId.trim().toLowerCase())
      .eq('login_password', password)
      .maybeSingle()

    if (error) { setLoginError('Login service error. Please try again.'); setLoading(false); return }
    if (!data) { setLoginError('Invalid User ID or password.'); setLoading(false); return }
    if (!data.is_active) { setLoginError('This account is inactive. Contact your administrator.'); setLoading(false); return }

    const role = data.roles as { role_name?: string; department?: string; permissions?: string[] } | null
    onLogin({
      id: data.id,
      employee_name: data.employee_name,
      login_id: data.login_id,
      role_name: role?.role_name ?? null,
      department: role?.department ?? null,
      permissions: role?.permissions ?? [],
    })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0D1F40' }}>
      {/* Left panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 60, background: 'linear-gradient(160deg, #060E1C 0%, #0D1F40 45%, #0F2347 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.12)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.08)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.08)', pointerEvents: 'none' }} />

        <div style={{ textAlign: 'center', zIndex: 1 }}>
          {/* Logo on a styled white card — intentional, not accidental */}
          <div style={{ width: 160, height: 160, margin: '0 auto 24px', background: 'white', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(201,168,76,0.25)', padding: 12 }}>
            <img
              src="/src/imports/HOZYN_LOGO.png"
              alt="HoZyn Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div style={{ color: 'rgba(201,168,76,0.8)', fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 32 }}>Hotel ERP System</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13.5, maxWidth: 300, lineHeight: 1.8, margin: '0 auto' }}>
            Complete hotel management — reservations, POS, housekeeping, analytics & more.
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 48, justifyContent: 'center' }}>
            {[['10+', 'Modules'], ['Real-time', 'Analytics'], ['24/7', 'Ready']].map(([val, lbl]) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{ color: '#C9A84C', fontSize: 16, fontWeight: 700, fontFamily: "'Playfair Display', serif" }}>{val}</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form — warm off-white to echo the gold */}
      <div style={{ width: 480, background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Mini logo on form side — multiply removes white on light bg */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <img
              src="/src/imports/HOZYN_LOGO.png"
              alt="HoZyn"
              style={{ width: 44, height: 44, objectFit: 'contain', mixBlendMode: 'multiply' }}
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif", lineHeight: 1.1 }}>HoZyn</div>
              <div style={{ fontSize: 10, color: '#C9A84C', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hotel ERP</div>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif", marginBottom: 5 }}>Welcome Back</h2>
            <p style={{ color: '#94A3B8', fontSize: 13 }}>Sign in with your employee credentials</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="erp-label">User ID</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14 }}>@</span>
                <input
                  className="erp-input"
                  type="text"
                  placeholder="your.userid"
                  value={loginId}
                  onChange={e => { setLoginId(e.target.value); setLoginError(null) }}
                  style={{ paddingLeft: 26, background: 'white', borderColor: '#E2E8F0' }}
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="erp-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="erp-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setLoginError(null) }}
                  required
                  style={{ paddingRight: 38, background: 'white', borderColor: '#E2E8F0' }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14 }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {loginError && (
              <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', display: 'flex', gap: 7, alignItems: 'center' }}>
                <span>⚠️</span> {loginError}
              </div>
            )}
            <button
              className="btn-primary"
              type="submit"
              disabled={loading || !loginId || !password}
              style={{ marginTop: 6, padding: '13px', fontSize: 14, borderRadius: 8, background: 'linear-gradient(135deg, #0D1F40, #1a3260)', opacity: (!loginId || !password) ? 0.55 : 1, letterSpacing: '0.03em' }}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div style={{ marginTop: 24, padding: '12px 14px', background: 'white', borderRadius: 8, border: '1px solid #E8E4D9', fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: '#C9A84C', marginBottom: 3 }}>💡 First time?</div>
            <div style={{ color: '#64748B', lineHeight: 1.6 }}>Go to <strong>Employees</strong> module → Add Employee → set a User ID and password.</div>
          </div>

          <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#CBD5E1', letterSpacing: '0.05em' }}>
            MANAGE · AUTOMATE · GROW
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Loading fallback ─────────────────────────────────────────────────────────

function ModuleLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 58px)', flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #E2E8F0', borderTopColor: '#C9A84C', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <div style={{ fontSize: 13, color: '#94A3B8' }}>Loading module…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Session persistence ──────────────────────────────────────────────────────
// Three-layer approach: window global (survives Vite HMR), localStorage (survives
// full page reloads), and a useEffect safety net.

const SESSION_KEY = 'hozyn_session'

// Augment window so the session survives Vite HMR hot-updates
declare global { interface Window { __hozyn_user?: LoggedInUser } }

function readSession(): LoggedInUser | null {
  // Layer 1: window global — set immediately on login, survives HMR
  if (window.__hozyn_user?.employee_name) return window.__hozyn_user
  // Layer 2: localStorage — persists across full page reloads
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.employee_name) return null
    window.__hozyn_user = parsed   // re-populate window cache
    return parsed as LoggedInUser
  } catch { return null }
}

function writeSession(u: LoggedInUser) {
  window.__hozyn_user = u
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)) } catch { /* quota/sandboxed */ }
}

function clearSession() {
  window.__hozyn_user = undefined
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

export default function App() {
  const [user, setUser] = useState<LoggedInUser | null>(readSession)
  const [activeModule, setActiveModule] = useState('dashboard')
  const [checkoutResId, setCheckoutResId] = useState<string | undefined>(undefined)
  const [guestsAutoAdd, setGuestsAutoAdd] = useState(false)
  const [settingsInitial, setSettingsInitial] = useState<{ tab?: string; goType?: string } | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)

  // These hooks MUST stay before any conditional return (Rules of Hooks)
  const hasAll = user?.permissions?.includes('all')
  const hasRestaurant = !!(hasAll || user?.permissions?.includes('restaurant'))
  const isManagement = !!(hasAll || user?.permissions?.includes('management'))
  useOrderNotification(hasRestaurant)
  const { notifications, unread, muted, toggleMute, markAllRead, clearAll, ICONS } = useNotifications(isManagement)

  useEffect(() => { document.title = 'HoZyn Hotel ERP' }, [])

  useEffect(() => {
    if (!user) {
      const saved = readSession()
      if (saved) setUser(saved)
    }
  }, [])

  const handleLogin = (u: LoggedInUser) => {
    writeSession(u)
    setUser(u)
  }

  const handleLogout = () => {
    clearSession()
    setUser(null)
  }

  if (!user || typeof user !== 'object' || !('employee_name' in user)) return <Login onLogin={handleLogin} />

  const allowedIds = hasAll ? nav.map(n => n.id) : (user.permissions ?? [])

  // If current module is not allowed, show first allowed or a fallback
  const safeModule = allowedIds.includes(activeModule) ? activeModule : (allowedIds[0] ?? 'dashboard')

  const sidebarW = collapsed ? 62 : 234

  return (
    <div style={{ display: 'flex', background: '#F4F6FA', minHeight: '100vh' }}>
      <Sidebar active={safeModule} onChange={m => { setCheckoutResId(undefined); setGuestsAutoAdd(false); setActiveModule(m) }} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} permissions={user.permissions ?? []} />
      <div style={{ marginLeft: sidebarW, flex: 1, minWidth: 0, transition: 'margin-left 0.2s ease' }}>
        <TopBar module={safeModule} user={user} onLogout={handleLogout} notifications={notifications} unread={unread} muted={muted} toggleMute={toggleMute} markAllRead={markAllRead} clearAll={clearAll} ICONS={ICONS} />
        <main style={{ minHeight: 'calc(100vh - 58px)' }}>
          <Suspense fallback={<ModuleLoader />}>
            <ActiveModule
              id={safeModule}
              onNavigate={(m, resId, action) => {
                setCheckoutResId(resId ?? undefined)
                setGuestsAutoAdd(m === 'guests' && action === 'add')
                if (m === 'settings' && action?.startsWith('guest_options:')) {
                  const goType = action.split(':')[1]
                  setSettingsInitial({ tab: 'guest_options', goType })
                } else if (m !== 'settings') {
                  setSettingsInitial(undefined)
                }
                setActiveModule(m)
              }}
              currentUser={user!}
              checkoutResId={checkoutResId}
              guestsAutoAdd={guestsAutoAdd}
              settingsInitial={settingsInitial}
            />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
