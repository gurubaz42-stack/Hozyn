import { useState, useEffect, useCallback } from 'react'
import { supabase, type DbGuest } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt } from '../data'
import { Modal, Field, StatusBadge, PageLoader, ErrorBanner } from '../ui'

export default function GuestManagement() {
  const [guests, setGuests] = useState<DbGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editGuest, setEditGuest] = useState<DbGuest | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<DbGuest>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [guestsRes, historyRes] = await Promise.all([
      supabase.from('guests').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('vw_guest_history').select('guest_id, total_stays, total_room_revenue'),
    ])
    if (guestsRes.error) { setError(guestsRes.error.message); setLoading(false); return }
    // Merge live stats from view into guest rows
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
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['guests'], load)

  const filtered = guests.filter(g =>
    (g.guest_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (g.phone || '').includes(search) ||
    (g.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setForm({}); setEditGuest(null); setSaveError(null); setShowModal(true) }
  const openEdit = (g: DbGuest) => { setForm({ ...g }); setEditGuest(g); setSaveError(null); setShowModal(true) }
  const set = (k: keyof DbGuest, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaveError(null)
    if (!form.guest_name?.trim()) { setSaveError('Guest name is required.'); return }
    if (!form.phone?.trim()) { setSaveError('Phone number is required.'); return }
    setSaving(true)
    // Duplicate phone check
    const phone = form.phone.trim()
    const { data: existing } = await supabase
      .from('guests').select('id, guest_name').eq('phone', phone).eq('is_deleted', false).maybeSingle()
    if (existing && existing.id !== editGuest?.id) {
      setSaveError(`Phone number already registered to guest: ${existing.guest_name}`)
      setSaving(false); return
    }

    const payload = {
      guest_name: form.guest_name.trim(),
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      address: form.address?.trim() || null,
      nationality: form.nationality?.trim() || null,
      id_proof_type: form.id_proof_type || null,
      id_number: form.id_number?.trim() || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      remarks: form.remarks?.trim() || null,
    }

    console.log('[Guests] saving payload:', payload)

    let err: { message: string } | null = null
    if (editGuest) {
      const res = await supabase.from('guests').update(payload).eq('id', editGuest.id)
      err = res.error
    } else {
      const res = await supabase.from('guests').insert(payload)
      err = res.error
    }

    console.log('[Guests] save result error:', err)

    if (err) {
      setSaveError(err.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const { error: err } = await supabase.from('guests').delete().eq('id', deleteId)
    if (err) {
      setError('Delete failed: ' + err.message)
    }
    setDeleteId(null)
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
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 13 }}>🔍</span>
              <input className="erp-input" placeholder="Search guests…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240, paddingLeft: 30 }} />
            </div>
            <button className="btn-primary" onClick={openAdd}>+ Add Guest</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Email</th><th>Nationality</th>
                <th>ID Proof</th><th>Gender</th><th>Stays</th><th>Total Spend</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr key="empty"><td colSpan={9} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No guests found</td></tr>
                : filtered.map(g => (
                <tr key={g.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {(g.guest_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{g.guest_name}</span>
                    </div>
                  </td>
                  <td>{g.phone || '—'}</td>
                  <td style={{ color: '#3B82F6', fontSize: 12.5 }}>{g.email || '—'}</td>
                  <td>{g.nationality || '—'}</td>
                  <td>
                    {g.id_proof_type && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#F1F5F9', borderRadius: 4 }}>{g.id_proof_type}</span>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{g.gender || '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{g.total_stays || 0}</td>
                  <td style={{ fontWeight: 600, color: '#C9A84C' }}>{fmt(g.total_spend || 0)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => openEdit(g)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12, color: '#0D1F40' }}>Edit</button>
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
            {([
              ['guest_name', 'Guest Name *', 'text', 'Full name'],
              ['phone', 'Phone', 'text', '+91 98xxx xxxxx'],
              ['email', 'Email', 'email', 'guest@email.com'],
              ['nationality', 'Nationality', 'text', 'e.g. Indian'],
              ['date_of_birth', 'Date of Birth', 'date', ''],
              ['id_number', 'ID Number', 'text', 'Document number'],
            ] as const).map(([k, label, type, ph]) => (
              <Field key={k} label={label}>
                <input
                  className="erp-input"
                  type={type}
                  placeholder={ph}
                  value={(form as Record<string, string>)[k] || ''}
                  onChange={e => set(k as keyof DbGuest, e.target.value)}
                  style={(k === 'guest_name' && saveError?.includes('name')) || (k === 'phone' && saveError?.includes('Phone')) ? { borderColor: '#EF4444' } : {}}
                />
              </Field>
            ))}
            <Field label="Gender">
              <select className="erp-input" value={form.gender || ''} onChange={e => set('gender', e.target.value)}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="ID Proof Type">
              <select className="erp-input" value={form.id_proof_type || ''} onChange={e => set('id_proof_type', e.target.value)}>
                <option value="">Select type</option>
                {['Aadhaar Card', 'Passport', 'PAN Card', 'Voter ID', "Driver's License", 'OCI Card'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address">
                <input className="erp-input" placeholder="Full address" value={form.address || ''} onChange={e => set('address', e.target.value)} />
              </Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Remarks">
                <textarea className="erp-input" placeholder="Special notes…" value={form.remarks || ''} onChange={e => set('remarks', e.target.value)} style={{ resize: 'vertical', minHeight: 56 }} />
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
