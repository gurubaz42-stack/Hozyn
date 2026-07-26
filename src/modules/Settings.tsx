import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Modal, Field, PageLoader } from '../ui'

interface HotelInfo {
  hotel_name: string; address: string; phone: string; email: string
  website: string; gstin: string; pan: string; star_rating: string
  check_in_time: string; check_out_time: string; currency: string
}
interface TaxRow { id: string; tax_name: string; rate: number; applicable_on: string; is_active: boolean; sort_order: number }
interface RoomType { id: string; type_name: string; base_rate: number; extra_adult_rate: number; extra_child_rate: number; max_occupancy: number }

const DEFAULTS: HotelInfo = {
  hotel_name: 'HoZyn Hotel', address: '', phone: '', email: '', website: '',
  gstin: '', pan: '', star_rating: '3', check_in_time: '12:00', check_out_time: '11:00', currency: 'INR',
}

const PAY_METHODS = [
  { code: 'cash', label: 'Cash' }, { code: 'card', label: 'Credit / Debit Card' },
  { code: 'upi', label: 'UPI / QR Code' }, { code: 'bank_transfer', label: 'Bank Transfer / NEFT' },
  { code: 'cheque', label: 'Cheque' }, { code: 'corporate', label: 'Corporate Account' },
]

function getPayActive(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('hozyn_pay_methods') || '{}') }
  catch { return {} }
}
function setPayActive(map: Record<string, boolean>) {
  localStorage.setItem('hozyn_pay_methods', JSON.stringify(map))
}

export default function HotelSettings() {
  const [tab, setTab] = useState<'hotel' | 'taxes' | 'room_types' | 'payments'>('hotel')

  // Hotel info
  const [hotelInfo, setHotelInfo] = useState<HotelInfo>(DEFAULTS)
  const [hotelLoading, setHotelLoading] = useState(true)
  const [hotelSaving, setHotelSaving] = useState(false)
  const [hotelMsg, setHotelMsg] = useState<string | null>(null)

  // Taxes
  const [taxes, setTaxes] = useState<TaxRow[]>([])
  const [taxLoading, setTaxLoading] = useState(true)
  const [showTaxModal, setShowTaxModal] = useState(false)
  const [editTax, setEditTax] = useState<TaxRow | null>(null)
  const [taxForm, setTaxForm] = useState({ tax_name: '', rate: '', applicable_on: '', is_active: true })
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxError, setTaxError] = useState<string | null>(null)
  const [taxDeleteConfirm, setTaxDeleteConfirm] = useState<string | null>(null)

  // Room types
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [rtLoading, setRtLoading] = useState(true)
  const [showRtModal, setShowRtModal] = useState(false)
  const [editRt, setEditRt] = useState<RoomType | null>(null)
  const [rtForm, setRtForm] = useState({ type_name: '', base_rate: '', extra_adult_rate: '', extra_child_rate: '', max_occupancy: '2' })
  const [rtSaving, setRtSaving] = useState(false)
  const [rtError, setRtError] = useState<string | null>(null)
  const [rtDeleteConfirm, setRtDeleteConfirm] = useState<string | null>(null)

  // Payment methods
  const [payActive, setPayActiveState] = useState<Record<string, boolean>>(() => {
    const saved = getPayActive()
    const defaults: Record<string, boolean> = { cash: true, card: true, upi: true, bank_transfer: true, cheque: false, corporate: true }
    return { ...defaults, ...saved }
  })

  const loadHotel = useCallback(async () => {
    setHotelLoading(true)
    const { data } = await supabase.from('hotel_settings').select('*').eq('id', 'main').maybeSingle()
    if (data) setHotelInfo({ ...DEFAULTS, ...data })
    setHotelLoading(false)
  }, [])

  const loadTaxes = useCallback(async () => {
    setTaxLoading(true)
    const { data } = await supabase.from('tax_config').select('*').order('sort_order')
    setTaxes((data || []) as TaxRow[])
    setTaxLoading(false)
  }, [])

  const loadRoomTypes = useCallback(async () => {
    setRtLoading(true)
    const { data } = await supabase.from('room_type').select('id, type_name, base_rate, extra_adult_rate, extra_child_rate, max_occupancy').order('type_name')
    setRoomTypes((data || []) as RoomType[])
    setRtLoading(false)
  }, [])

  useEffect(() => { loadHotel(); loadTaxes(); loadRoomTypes() }, [loadHotel, loadTaxes, loadRoomTypes])

  const saveHotel = async () => {
    setHotelSaving(true); setHotelMsg(null)
    const { error } = await supabase.from('hotel_settings').upsert({ id: 'main', ...hotelInfo })
    setHotelMsg(error ? `⚠️ ${error.message}` : '✓ Saved successfully')
    setHotelSaving(false)
    setTimeout(() => setHotelMsg(null), 3000)
  }

  // Tax handlers
  const openAddTax = () => {
    setEditTax(null); setTaxForm({ tax_name: '', rate: '', applicable_on: '', is_active: true }); setTaxError(null); setShowTaxModal(true)
  }
  const openEditTax = (t: TaxRow) => {
    setEditTax(t); setTaxForm({ tax_name: t.tax_name, rate: String(t.rate), applicable_on: t.applicable_on, is_active: t.is_active }); setTaxError(null); setShowTaxModal(true)
  }
  const saveTax = async () => {
    if (!taxForm.tax_name.trim()) { setTaxError('Tax name is required'); return }
    if (!taxForm.rate || isNaN(Number(taxForm.rate))) { setTaxError('Valid rate required'); return }
    setTaxSaving(true)
    const payload = { tax_name: taxForm.tax_name.trim(), rate: Number(taxForm.rate), applicable_on: taxForm.applicable_on, is_active: taxForm.is_active }
    const { error } = editTax
      ? await supabase.from('tax_config').update(payload).eq('id', editTax.id)
      : await supabase.from('tax_config').insert(payload)
    if (error) { setTaxError(error.message); setTaxSaving(false); return }
    setTaxSaving(false); setShowTaxModal(false); loadTaxes()
  }
  const deleteTax = async (id: string) => {
    await supabase.from('tax_config').delete().eq('id', id)
    setTaxDeleteConfirm(null); loadTaxes()
  }
  const toggleTax = async (t: TaxRow) => {
    await supabase.from('tax_config').update({ is_active: !t.is_active }).eq('id', t.id)
    loadTaxes()
  }

  // Room type handlers
  const openAddRt = () => {
    setEditRt(null); setRtForm({ type_name: '', base_rate: '', extra_adult_rate: '', extra_child_rate: '', max_occupancy: '2' }); setRtError(null); setShowRtModal(true)
  }
  const openEditRt = (r: RoomType) => {
    setEditRt(r); setRtForm({ type_name: r.type_name, base_rate: String(r.base_rate || ''), extra_adult_rate: String(r.extra_adult_rate || ''), extra_child_rate: String(r.extra_child_rate || ''), max_occupancy: String(r.max_occupancy || 2) }); setRtError(null); setShowRtModal(true)
  }
  const saveRt = async () => {
    if (!rtForm.type_name.trim()) { setRtError('Room type name is required'); return }
    setRtSaving(true)
    const payload = {
      type_name: rtForm.type_name.trim(),
      base_rate: Number(rtForm.base_rate) || 0,
      extra_adult_rate: Number(rtForm.extra_adult_rate) || 0,
      extra_child_rate: Number(rtForm.extra_child_rate) || 0,
      max_occupancy: Number(rtForm.max_occupancy) || 2,
    }
    const { error } = editRt
      ? await supabase.from('room_type').update(payload).eq('id', editRt.id)
      : await supabase.from('room_type').insert(payload)
    if (error) { setRtError(error.message); setRtSaving(false); return }
    setRtSaving(false); setShowRtModal(false); loadRoomTypes()
  }
  const deleteRt = async (id: string) => {
    // Check if any rooms reference this type
    const { count } = await supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('room_type_id', id)
    if (count && count > 0) {
      setRtError(`Cannot delete — ${count} room(s) are assigned this type. Reassign those rooms first.`)
      setRtDeleteConfirm(null); return
    }
    const { error } = await supabase.from('room_type').delete().eq('id', id)
    if (error) { setRtError(error.message); setRtDeleteConfirm(null); return }
    setRtDeleteConfirm(null); loadRoomTypes()
  }

  const togglePay = (code: string) => {
    const updated = { ...payActive, [code]: !payActive[code] }
    setPayActiveState(updated); setPayActive(updated)
  }

  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')
  const tabs = [
    { id: 'hotel', label: '🏨 Hotel Information' }, { id: 'taxes', label: '📊 Taxes' },
    { id: 'room_types', label: '🛏 Room Types' }, { id: 'payments', label: '💳 Payment Methods' },
  ]

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)} style={{ padding: '8px 16px', borderRadius: 6, border: '1.5px solid', borderColor: tab === t.id ? '#0D1F40' : '#E2E8F0', background: tab === t.id ? '#0D1F40' : 'white', color: tab === t.id ? 'white' : '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {/* ── HOTEL INFO ── */}
      {tab === 'hotel' && (
        hotelLoading ? <PageLoader label="Loading hotel info…" /> : (
          <div className="erp-card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Hotel Information</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {hotelMsg && <span style={{ fontSize: 13, color: hotelMsg.startsWith('✓') ? '#065F46' : '#991B1B', fontWeight: 600 }}>{hotelMsg}</span>}
                <button className="btn-primary" onClick={saveHotel} disabled={hotelSaving}>{hotelSaving ? 'Saving…' : '✓ Save Changes'}</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {([
                ['hotel_name', 'Hotel Name', 'text'],
                ['star_rating', 'Star Rating (1-5)', 'number'],
                ['phone', 'Phone', 'text'],
                ['email', 'Email', 'email'],
                ['website', 'Website', 'text'],
                ['gstin', 'GSTIN', 'text'],
                ['pan', 'PAN Number', 'text'],
                ['currency', 'Currency', 'text'],
                ['check_in_time', 'Check-in Time', 'time'],
                ['check_out_time', 'Check-out Time', 'time'],
              ] as [string, string, string][]).map(([k, label, type]) => (
                <Field key={k} label={label}>
                  <input className="erp-input" type={type} value={(hotelInfo as Record<string, string>)[k]} onChange={e => setHotelInfo(p => ({ ...p, [k]: e.target.value }))} />
                </Field>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Full Address">
                  <textarea className="erp-input" value={hotelInfo.address} onChange={e => setHotelInfo(p => ({ ...p, address: e.target.value }))} style={{ resize: 'vertical', minHeight: 64 }} />
                </Field>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── TAXES ── */}
      {tab === 'taxes' && (
        taxLoading ? <PageLoader label="Loading taxes…" /> : (
          <div className="erp-card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Tax Configuration</div>
              <button className="btn-primary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={openAddTax}>+ Add Tax</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="erp-table">
                <thead><tr><th>Tax Name</th><th>Rate (%)</th><th>Applicable On</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {taxes.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No taxes configured</td></tr>
                    : taxes.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.tax_name}</td>
                        <td style={{ fontWeight: 700, color: '#C9A84C' }}>{t.rate}%</td>
                        <td><span style={{ fontSize: 11, padding: '2px 8px', background: '#EFF2F8', borderRadius: 4, color: '#0D1F40', fontWeight: 600 }}>{t.applicable_on || '—'}</span></td>
                        <td>
                          <button onClick={() => toggleTax(t)} style={{ padding: '2px 9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: t.is_active ? '#D1FAE5' : '#F1F5F9', color: t.is_active ? '#065F46' : '#64748B' }}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openEditTax(t)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                            {taxDeleteConfirm === t.id
                              ? <><button onClick={() => deleteTax(t.id)} style={{ padding: '4px 8px', border: 'none', borderRadius: 5, background: '#EF4444', cursor: 'pointer', fontSize: 11, color: 'white', fontWeight: 600 }}>Yes, Delete</button><button onClick={() => setTaxDeleteConfirm(null)} style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11 }}>No</button></>
                              : <button onClick={() => setTaxDeleteConfirm(t.id)} style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11, color: '#EF4444' }}>✕</button>
                            }
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── ROOM TYPES ── */}
      {tab === 'room_types' && (
        rtLoading ? <PageLoader label="Loading room types…" /> : (
          <div className="erp-card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Room Types & Rates</div>
              <button className="btn-primary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={openAddRt}>+ Add Type</button>
            </div>
            {rtError && !showRtModal && (
              <div style={{ margin: '0 20px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠️ {rtError}</span>
                <button onClick={() => setRtError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#991B1B', lineHeight: 1 }}>✕</button>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="erp-table">
                <thead><tr><th>Room Type</th><th>Base Rate</th><th>Extra Adult</th><th>Extra Child</th><th>Max Occ.</th><th></th></tr></thead>
                <tbody>
                  {roomTypes.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No room types defined</td></tr>
                    : roomTypes.map(rt => (
                      <tr key={rt.id}>
                        <td style={{ fontWeight: 600, color: '#0D1F40' }}>{rt.type_name}</td>
                        <td style={{ fontWeight: 700, color: '#C9A84C' }}>{fmt(rt.base_rate || 0)}</td>
                        <td>{fmt(rt.extra_adult_rate || 0)}</td>
                        <td>{fmt(rt.extra_child_rate || 0)}</td>
                        <td style={{ textAlign: 'center' }}>{rt.max_occupancy || 2}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openEditRt(rt)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                            {rtDeleteConfirm === rt.id
                              ? <><button onClick={() => deleteRt(rt.id)} style={{ padding: '4px 8px', border: 'none', borderRadius: 5, background: '#EF4444', cursor: 'pointer', fontSize: 11, color: 'white', fontWeight: 600 }}>Yes, Delete</button><button onClick={() => setRtDeleteConfirm(null)} style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11 }}>No</button></>
                              : <button onClick={() => setRtDeleteConfirm(rt.id)} style={{ padding: '4px 8px', border: '1px solid #FECACA', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11, color: '#EF4444' }}>✕</button>
                            }
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── PAYMENT METHODS ── */}
      {tab === 'payments' && (
        <div>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>Toggle payment methods to show/hide them in checkout.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {PAY_METHODS.map(pm => (
              <div key={pm.code} className="erp-card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 3 }}>{pm.label}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94A3B8' }}>{pm.code}</div>
                </div>
                <div onClick={() => togglePay(pm.code)} style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, background: payActive[pm.code] ? '#C9A84C' : '#E2E8F0', borderRadius: 22, transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: 'white', top: 3, left: payActive[pm.code] ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tax modal */}
      {showTaxModal && (
        <Modal title={editTax ? 'Edit Tax' : 'Add Tax'} onClose={() => setShowTaxModal(false)} maxWidth={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {taxError && <div style={{ padding: '9px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>⚠️ {taxError}</div>}
            <Field label="Tax Name"><input className="erp-input" placeholder="e.g. GST Room" value={taxForm.tax_name} onChange={e => setTaxForm(p => ({ ...p, tax_name: e.target.value }))} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Rate (%)"><input className="erp-input" type="number" min="0" max="100" placeholder="18" value={taxForm.rate} onChange={e => setTaxForm(p => ({ ...p, rate: e.target.value }))} /></Field>
              <Field label="Applicable On"><input className="erp-input" placeholder="Room Charges" value={taxForm.applicable_on} onChange={e => setTaxForm(p => ({ ...p, applicable_on: e.target.value }))} /></Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, color: '#475569' }}>
              <input type="checkbox" checked={taxForm.is_active} onChange={e => setTaxForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: '#C9A84C', width: 15, height: 15 }} />
              Active
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn-ghost" onClick={() => setShowTaxModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveTax} disabled={taxSaving}>{taxSaving ? 'Saving…' : editTax ? 'Update Tax' : 'Add Tax'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Room type modal */}
      {showRtModal && (
        <Modal title={editRt ? 'Edit Room Type' : 'Add Room Type'} onClose={() => setShowRtModal(false)} maxWidth={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rtError && <div style={{ padding: '9px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>⚠️ {rtError}</div>}
            <Field label="Room Type Name"><input className="erp-input" placeholder="e.g. Deluxe" value={rtForm.type_name} onChange={e => setRtForm(p => ({ ...p, type_name: e.target.value }))} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Base Rate (₹/night)"><input className="erp-input" type="number" min="0" placeholder="5000" value={rtForm.base_rate} onChange={e => setRtForm(p => ({ ...p, base_rate: e.target.value }))} /></Field>
              <Field label="Max Occupancy"><input className="erp-input" type="number" min="1" placeholder="2" value={rtForm.max_occupancy} onChange={e => setRtForm(p => ({ ...p, max_occupancy: e.target.value }))} /></Field>
              <Field label="Extra Adult Rate (₹)"><input className="erp-input" type="number" min="0" placeholder="1000" value={rtForm.extra_adult_rate} onChange={e => setRtForm(p => ({ ...p, extra_adult_rate: e.target.value }))} /></Field>
              <Field label="Extra Child Rate (₹)"><input className="erp-input" type="number" min="0" placeholder="500" value={rtForm.extra_child_rate} onChange={e => setRtForm(p => ({ ...p, extra_child_rate: e.target.value }))} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn-ghost" onClick={() => setShowRtModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveRt} disabled={rtSaving}>{rtSaving ? 'Saving…' : editRt ? 'Update Type' : 'Add Type'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
