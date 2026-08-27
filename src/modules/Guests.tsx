import { useState, useEffect, useCallback } from 'react'
import { supabase, type DbGuest } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt } from '../data'
import { Modal, Field, PageLoader, ErrorBanner } from '../ui'

interface GuestOption { id: string; type: 'nationality' | 'category' | 'state'; value: string; parent_value?: string | null }

type NavigateFn = (m: string, resId?: string, action?: string) => void

// A select that shows options + an "Add new…" item at the bottom that calls onAddNew
function OptionSelect({ value, onChange, options, placeholder, onAddNew }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  onAddNew: () => void
}) {
  return (
    <select
      className="erp-input"
      value={value}
      onChange={e => {
        if (e.target.value === '__add_new__') { onAddNew(); return }
        onChange(e.target.value)
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(v => <option key={v} value={v}>{v}</option>)}
      <option disabled style={{ color: '#CBD5E1' }}>──────────</option>
      <option value="__add_new__">➕ Add new option in Settings…</option>
    </select>
  )
}

export default function GuestManagement({ autoOpenAdd, onNavigate }: { autoOpenAdd?: boolean; onNavigate?: NavigateFn } = {}) {
  const [guests, setGuests] = useState<DbGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editGuest, setEditGuest] = useState<DbGuest | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [blockGuest, setBlockGuest] = useState<DbGuest | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [guestOptions, setGuestOptions] = useState<GuestOption[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [guestsRes, historyRes, optionsRes] = await Promise.all([
      supabase.from('guests').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('vw_guest_history').select('guest_id, total_stays, total_room_revenue'),
      supabase.from('guest_options').select('id, type, value, parent_value').order('value'),
    ])
    if (guestsRes.error) { setError(guestsRes.error.message); setLoading(false); return }
    const statsMap = Object.fromEntries(
      (historyRes.data || []).map((h: { guest_id: string; total_stays: number; total_room_revenue: number }) =>
        [h.guest_id, { total_stays: Number(h.total_stays) || 0, total_spend: Number(h.total_room_revenue) || 0 }]
      )
    )
    const merged = (guestsRes.data || []).map((g: DbGuest) => ({
      ...g,
      total_stays: statsMap[g.id]?.total_stays ?? 0,
      total_spend: statsMap[g.id]?.total_spend ?? 0,
    }))
    setGuests(merged)
    setGuestOptions((optionsRes.data || []) as GuestOption[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['guests', 'guest_options'], load)

  // Auto-open Add Guest when navigated here from Reservations
  useEffect(() => {
    if (autoOpenAdd && !loading) openAdd()
  }, [autoOpenAdd, loading])

  const [guestFilter, setGuestFilter] = useState<'active' | 'blocked' | 'all'>('active')

  const filtered = guests.filter(g => {
    const matchSearch = (g.guest_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (g.phone || '').includes(search) ||
      (g.email || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = guestFilter === 'all' ? true : guestFilter === 'blocked' ? !!g.is_blocked : !g.is_blocked
    return matchSearch && matchFilter
  })

  const f = (k: string) => form[k] || ''
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const openAdd = () => {
    setForm({})
    setEditGuest(null); setSaveError(null); setShowModal(true)
  }
  const openEdit = (g: DbGuest) => {
    // Flatten all guest fields into a string map for the form
    const flat: Record<string, string> = {}
    Object.entries(g).forEach(([k, v]) => { flat[k] = v == null ? '' : String(v) })
    setForm(flat)
    setEditGuest(g); setSaveError(null); setShowModal(true)
  }

  // Derived option lists
  const countries   = guestOptions.filter(o => o.type === 'nationality').map(o => o.value)
  const categories  = guestOptions.filter(o => o.type === 'category').map(o => o.value)
  // States filtered by selected country
  const selectedCountry = f('nationality')
  const states = selectedCountry
    ? guestOptions.filter(o => o.type === 'state' && o.parent_value === selectedCountry).map(o => o.value)
    : guestOptions.filter(o => o.type === 'state').map(o => o.value)

  // Navigate to Settings → Guest Options with specific sub-type pre-selected
  const goToSettings = (goType: 'nationality' | 'category' | 'state') => {
    setShowModal(false)
    onNavigate?.('settings', undefined, `guest_options:${goType}`)
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!f('guest_name').trim()) { setSaveError('Guest name is required.'); return }
    if (!f('phone').trim()) { setSaveError('Phone number is required.'); return }
    setSaving(true)
    const phone = f('phone').trim()
    const { data: existing } = await supabase
      .from('guests').select('id, guest_name').eq('phone', phone).eq('is_deleted', false).maybeSingle()
    if (existing && existing.id !== editGuest?.id) {
      setSaveError(`Phone number already registered to guest: ${existing.guest_name}`)
      setSaving(false); return
    }

    const payload: Record<string, string | null> = {
      guest_name:    f('guest_name').trim() || null,
      phone:         f('phone').trim() || null,
      email:         f('email').trim() || null,
      address:       f('address').trim() || null,
      nationality:   f('nationality').trim() || null,
      state:         f('state').trim() || null,
      category:      f('category').trim() || null,
      id_proof_type: f('id_proof_type') || null,
      id_number:     f('id_number').trim() || null,
      date_of_birth: f('date_of_birth') || null,
      gender:        f('gender') || null,
      remarks:       f('remarks').trim() || null,
    }

    let err: { message: string } | null = null
    if (editGuest) {
      const res = await supabase.from('guests').update(payload).eq('id', editGuest.id)
      err = res.error
    } else {
      const res = await supabase.from('guests').insert(payload)
      err = res.error
    }
    if (err) { setSaveError(err.message); setSaving(false); return }
    setSaving(false); setShowModal(false); load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error: err } = await supabase.from('guests').delete().eq('id', deleteId)
    if (err) setError('Delete failed: ' + err.message)
    setDeleteId(null); load()
  }

  const handleBlock = async () => {
    if (!blockGuest) return
    setBlocking(true)
    await supabase.from('guests').update({ is_blocked: true, block_reason: blockReason.trim() || null }).eq('id', blockGuest.id)
    setBlocking(false); setBlockGuest(null); setBlockReason(''); load()
  }

  const handleUnblock = async (g: DbGuest) => {
    await supabase.from('guests').update({ is_blocked: false, block_reason: null }).eq('id', g.id)
    load()
  }

  if (loading) return <PageLoader label="Loading guests…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div className="erp-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
            Guest Directory ({filtered.length})
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
              {(['active', 'blocked', 'all'] as const).map(f => (
                <button key={f} onClick={() => setGuestFilter(f)} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: guestFilter === f ? (f === 'blocked' ? '#FEF2F2' : 'white') : 'transparent', color: guestFilter === f ? (f === 'blocked' ? '#DC2626' : '#0D1F40') : '#64748B', boxShadow: guestFilter === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  {f === 'active' ? `✓ Active (${guests.filter(g => !g.is_blocked).length})` : f === 'blocked' ? `🚫 Blocked (${guests.filter(g => !!g.is_blocked).length})` : 'All'}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 13 }}>🔍</span>
              <input className="erp-input" placeholder="Search guests…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220, paddingLeft: 30 }} />
            </div>
            <button className="btn-primary" onClick={openAdd}>+ Add Guest</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Email</th><th>Nationality</th>
                <th>State</th><th>Category</th><th>Age</th><th>ID Proof</th><th>Stays</th><th>Spend</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr key="empty"><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No guests found</td></tr>
                : filtered.map(g => (
                <tr key={g.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: g.is_blocked ? '#FCA5A5' : '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: g.is_blocked ? '#7F1D1D' : '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {(g.guest_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{g.guest_name}</div>
                        {g.is_blocked && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: 4 }}>🚫 BLOCKED</span>
                            {g.block_reason && <span style={{ fontSize: 10, color: '#94A3B8' }}>{String(g.block_reason)}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{g.phone || '—'}</td>
                  <td style={{ color: '#3B82F6', fontSize: 12.5 }}>{g.email || '—'}</td>
                  <td>{g.nationality || '—'}</td>
                  <td>{g.state || '—'}</td>
                  <td>{g.category || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {g.date_of_birth
                      ? Math.floor((Date.now() - new Date(g.date_of_birth).getTime()) / 31557600000)
                      : '—'}
                  </td>
                  <td>
                    {g.id_proof_type && <span style={{ fontSize: 11, padding: '2px 8px', background: '#F1F5F9', borderRadius: 4 }}>{g.id_proof_type}</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{g.total_stays || 0}</td>
                  <td style={{ fontWeight: 600, color: '#C9A84C' }}>{fmt(g.total_spend || 0)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => openEdit(g)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12, color: '#0D1F40' }}>Edit</button>
                      {g.is_blocked
                        ? <button onClick={() => handleUnblock(g)} style={{ padding: '4px 9px', border: '1px solid #A7F3D0', borderRadius: 5, background: '#ECFDF5', cursor: 'pointer', fontSize: 12, color: '#065F46', fontWeight: 600 }}>✓ Unblock</button>
                        : <button onClick={() => { setBlockGuest(g); setBlockReason('') }} style={{ padding: '4px 9px', border: '1px solid #FCD34D', borderRadius: 5, background: '#FFFBEB', cursor: 'pointer', fontSize: 12, color: '#92400E', fontWeight: 600 }}>🚫 Block</button>
                      }
                      <button onClick={() => setDeleteId(g.id)} style={{ padding: '4px 9px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 12, color: '#EF4444' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editGuest ? 'Edit Guest' : 'Add New Guest'} onClose={() => setShowModal(false)} maxWidth={720}>
          <div>
            {saveError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', fontWeight: 500 }}>
                ⚠️ {saveError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Basic */}
              <Field label="Guest Name *">
                <input className="erp-input" placeholder="Full name" value={f('guest_name')} onChange={e => set('guest_name', e.target.value)} />
              </Field>
              <Field label="Phone *">
                <input className="erp-input" placeholder="+91 98xxx xxxxx" value={f('phone')} onChange={e => set('phone', e.target.value)} />
              </Field>
              <Field label="Email">
                <input className="erp-input" type="email" placeholder="guest@email.com" value={f('email')} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Date of Birth">
                <input className="erp-input" type="date" value={f('date_of_birth')} onChange={e => set('date_of_birth', e.target.value)} />
              </Field>

              {/* Nationality (country) — linked to state */}
              <Field label="Nationality / Country">
                {countries.length > 0 ? (
                  <OptionSelect
                    value={f('nationality')}
                    onChange={v => { set('nationality', v); set('state', '') }}
                    options={countries}
                    placeholder="Select country"
                    onAddNew={() => goToSettings('nationality')}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="erp-input" placeholder="e.g. Indian" value={f('nationality')} onChange={e => { set('nationality', e.target.value); set('state', '') }} style={{ flex: 1 }} />
                    {onNavigate && <button type="button" onClick={() => goToSettings('nationality')} style={{ whiteSpace: 'nowrap', padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8F9FC', fontSize: 12, color: '#64748B', cursor: 'pointer' }}>+ Add options</button>}
                  </div>
                )}
              </Field>

              {/* State — filtered by selected country */}
              <Field label="State / Region">
                {states.length > 0 ? (
                  <OptionSelect
                    value={f('state')}
                    onChange={v => set('state', v)}
                    options={states}
                    placeholder={f('nationality') ? `States of ${f('nationality')}` : 'Select state'}
                    onAddNew={() => goToSettings('state')}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="erp-input" placeholder={f('nationality') ? `No states for ${f('nationality')} yet` : 'e.g. Tamil Nadu'} value={f('state')} onChange={e => set('state', e.target.value)} style={{ flex: 1 }} />
                    {onNavigate && <button type="button" onClick={() => goToSettings('state')} style={{ whiteSpace: 'nowrap', padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8F9FC', fontSize: 12, color: '#64748B', cursor: 'pointer' }}>+ Add options</button>}
                  </div>
                )}
              </Field>

              {/* Category */}
              <Field label="Guest Category">
                {categories.length > 0 ? (
                  <OptionSelect
                    value={f('category')}
                    onChange={v => set('category', v)}
                    options={categories}
                    placeholder="Select category"
                    onAddNew={() => goToSettings('category')}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="erp-input" placeholder="e.g. Corporate (add options in Settings)" value={f('category')} onChange={e => set('category', e.target.value)} style={{ flex: 1 }} />
                    {onNavigate && <button type="button" onClick={() => goToSettings('category')} style={{ whiteSpace: 'nowrap', padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8F9FC', fontSize: 12, color: '#64748B', cursor: 'pointer' }}>+ Add options</button>}
                  </div>
                )}
              </Field>

              {/* Gender */}
              <Field label="Gender">
                <select className="erp-input" value={f('gender')} onChange={e => set('gender', e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              {/* ID */}
              <Field label="ID Proof Type">
                <select className="erp-input" value={f('id_proof_type')} onChange={e => set('id_proof_type', e.target.value)}>
                  <option value="">Select type</option>
                  {['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID', "Driver's License", 'OCI Card'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="ID Number">
                <input className="erp-input" placeholder="Document number" value={f('id_number')} onChange={e => set('id_number', e.target.value)} />
              </Field>

              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Address">
                  <input className="erp-input" placeholder="Full address" value={f('address')} onChange={e => set('address', e.target.value)} />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Remarks">
                  <textarea className="erp-input" placeholder="Special notes…" value={f('remarks')} onChange={e => set('remarks', e.target.value)} style={{ resize: 'vertical', minHeight: 56 }} />
                </Field>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editGuest ? 'Update Guest' : 'Add Guest'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {blockGuest && (
        <div className="modal-overlay">
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(13,31,64,0.2)' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>🚫</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', marginBottom: 4, textAlign: 'center' }}>Block Guest</div>
            <div style={{ color: '#64748B', fontSize: 13, marginBottom: 18, textAlign: 'center' }}>
              <strong>{blockGuest.guest_name}</strong> will not be able to make new reservations.
            </div>
            <Field label="Reason for blocking (optional)">
              <input className="erp-input" placeholder="e.g. No-show, property damage…" value={blockReason} onChange={e => setBlockReason(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setBlockGuest(null)}>Cancel</button>
              <button onClick={handleBlock} disabled={blocking} style={{ padding: '8px 20px', background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                {blocking ? 'Blocking…' : '🚫 Block Guest'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay">
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(13,31,64,0.2)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', marginBottom: 8 }}>Delete Guest?</div>
            <div style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
