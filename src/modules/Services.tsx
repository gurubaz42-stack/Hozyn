import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt } from '../data'
import { Modal, Field, PageLoader, ErrorBanner } from '../ui'

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  is_active: boolean
  created_at: string
}

interface BillItem {
  service: Service
  quantity: number
}

interface OccupiedRoom {
  room_number: string
  guest_name: string
}

interface ServiceHistory {
  id: string
  charge_date: string
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  guest_name: string
  room_number: string
  folio_number: string | null
}

export default function Services() {
  const [tab, setTab] = useState<'manage' | 'bill' | 'history'>('manage')

  // ── Services state ──────────────────────────────────────────────────────────
  const [services, setServices] = useState<Service[]>([])
  const [svcLoading, setSvcLoading] = useState(true)
  const [svcError, setSvcError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editSvc, setEditSvc] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', price: '', is_active: true })

  const loadServices = useCallback(async () => {
    setSvcLoading(true); setSvcError(null)
    const { data, error } = await supabase.from('hotel_services').select('*').order('name')
    if (error) { setSvcError(error.message); setSvcLoading(false); return }
    setServices((data || []) as Service[])
    setSvcLoading(false)
  }, [])

  const openAdd = () => {
    setForm({ name: '', description: '', price: '', is_active: true })
    setEditSvc(null); setSaveError(null); setShowModal(true)
  }
  const openEdit = (s: Service) => {
    setForm({ name: s.name, description: s.description || '', price: String(s.price), is_active: s.is_active })
    setEditSvc(s); setSaveError(null); setShowModal(true)
  }
  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Service name is required.'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { setSaveError('Enter a valid price.'); return }
    setSaving(true)
    const payload = { name: form.name.trim(), description: form.description || null, price, is_active: form.is_active }
    const { error } = editSvc
      ? await supabase.from('hotel_services').update(payload).eq('id', editSvc.id)
      : await supabase.from('hotel_services').insert(payload)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaving(false); setShowModal(false); loadServices()
  }
  const handleDelete = async (id: string) => {
    await supabase.from('hotel_services').delete().eq('id', id)
    loadServices()
  }
  const toggleActive = async (s: Service) => {
    await supabase.from('hotel_services').update({ is_active: !s.is_active }).eq('id', s.id)
    loadServices()
  }

  // ── Bill tab state ──────────────────────────────────────────────────────────
  const [occupiedRooms, setOccupiedRooms] = useState<OccupiedRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState('')   // from dropdown
  const [manualRoom, setManualRoom] = useState('')       // typed override
  const [billItems, setBillItems] = useState<BillItem[]>([])
  const [isPaid, setIsPaid] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [postSuccess, setPostSuccess] = useState(false)

  // Effective room number: manual input takes priority if filled
  const effectiveRoom = manualRoom.trim() || selectedRoom

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true); setRoomsError(null)
    const { data, error } = await supabase
      .from('reservations')
      .select('rooms(room_number), guests(guest_name)')
      .eq('status', 'checked_in')
    if (error) { setRoomsError(error.message); setRoomsLoading(false); return }
    const list: OccupiedRoom[] = ((data || []) as any[])
      .map(r => ({
        room_number: (r.rooms as any)?.room_number ?? '',
        guest_name: (r.guests as any)?.guest_name ?? 'Unknown Guest',
      }))
      .filter(r => r.room_number !== '')
      .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    setOccupiedRooms(list)
    if (list.length > 0 && !selectedRoom) setSelectedRoom(list[0].room_number)
    setRoomsLoading(false)
  }, [])

  // ── History state ───────────────────────────────────────────────────────────
  const [history, setHistory] = useState<ServiceHistory[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)
  const [histSearch, setHistSearch] = useState('')

  const loadHistory = useCallback(async () => {
    setHistLoading(true); setHistError(null)
    const { data, error } = await supabase
      .from('folio_charges')
      .select(`
        id, charge_date, description, quantity, unit_price, net_amount,
        folios(folio_number, reservations(guests(guest_name), rooms(room_number)))
      `)
      .eq('charge_type', 'other')
      .order('charge_date', { ascending: false })
      .limit(200)
    if (error) { setHistError(error.message); setHistLoading(false); return }
    const rows: ServiceHistory[] = (data || []).map((c: any) => ({
      id: c.id,
      charge_date: c.charge_date,
      description: c.description,
      quantity: Number(c.quantity),
      unit_price: Number(c.unit_price),
      net_amount: Number(c.net_amount),
      guest_name: c.folios?.reservations?.guests?.guest_name ?? '—',
      room_number: c.folios?.reservations?.rooms?.room_number ?? '—',
      folio_number: c.folios?.folio_number ?? null,
    }))
    setHistory(rows)
    setHistLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'manage') loadServices()
    if (tab === 'bill') { loadServices(); loadRooms() }
    if (tab === 'history') loadHistory()
  }, [tab])

  useRealtime(['hotel_services', 'folio_charges', 'reservations', 'rooms'], () => {
    loadServices(); loadHistory()
  })

  // Bill logic
  const addItem = (svc: Service) => setBillItems(prev => {
    const ex = prev.find(i => i.service.id === svc.id)
    if (ex) return prev.map(i => i.service.id === svc.id ? { ...i, quantity: i.quantity + 1 } : i)
    return [...prev, { service: svc, quantity: 1 }]
  })
  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) setBillItems(p => p.filter(i => i.service.id !== id))
    else setBillItems(p => p.map(i => i.service.id === id ? { ...i, quantity: qty } : i))
  }
  const billSubtotal = billItems.reduce((s, i) => s + i.service.price * i.quantity, 0)

  const postToRoom = async () => {
    if (!effectiveRoom || billItems.length === 0) return
    setPosting(true); setPostError(null)

    // Look up room → active reservation → folio
    const { data: roomRow } = await supabase.from('rooms').select('id').eq('room_number', effectiveRoom).maybeSingle()
    if (!roomRow) { setPostError('Room not found.'); setPosting(false); return }
    const { data: resRow } = await supabase.from('reservations').select('id, guest_id').eq('room_id', roomRow.id).eq('status', 'checked_in').maybeSingle()
    if (!resRow) { setPostError('No active check-in for this room.'); setPosting(false); return }

    let folioId: string | null = null
    const { data: existingFolio } = await supabase.from('folios').select('id').eq('reservation_id', resRow.id).maybeSingle()
    if (existingFolio) {
      folioId = existingFolio.id
    } else {
      const { data: newFolio } = await supabase.from('folios').insert({ reservation_id: resRow.id, guest_id: resRow.guest_id }).select('id').single()
      if (newFolio) folioId = newFolio.id
    }
    if (!folioId) { setPostError('Could not create folio. Check RLS policies.'); setPosting(false); return }

    // Insert folio charges (description notes if pre-paid)
    const charges = billItems.map(({ service, quantity }) => ({
      folio_id: folioId,
      charge_type: 'other',
      description: service.name
        + (service.description ? ` — ${service.description}` : '')
        + (isPaid ? ' (Paid)' : ''),
      quantity,
      unit_price: service.price,
    }))
    const { error: chargeErr } = await supabase.from('folio_charges').insert(charges)
    if (chargeErr) { setPostError('Failed to post charges: ' + chargeErr.message); setPosting(false); return }

    // If paid: insert a payment so checkout deducts it from balance due
    if (isPaid && billSubtotal > 0) {
      await supabase.from('payments').insert({
        folio_id: folioId,
        amount: billSubtotal,
        payment_method: 'cash',
        payment_status: 'paid',
        notes: `Pre-paid service(s): ${billItems.map(i => i.service.name).join(', ')}`,
      })
    }

    setPosting(false); setPostSuccess(true); setBillItems([]); setManualRoom('')
    setTimeout(() => setPostSuccess(false), 2500)
  }

  const activeServices = services.filter(s => s.is_active)
  const filteredHistory = history.filter(h => {
    const q = histSearch.trim().toLowerCase()
    if (!q) return true
    return h.guest_name.toLowerCase().includes(q) || h.room_number.includes(q) || h.description.toLowerCase().includes(q)
  })

  const TABS = [
    { id: 'manage',  label: `Services (${services.length})` },
    { id: 'bill',    label: 'Bill to Room' },
    { id: 'history', label: 'History' },
  ] as const

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 22px', borderRadius: 7, border: '1.5px solid',
    borderColor: active ? '#0D1F40' : '#E2E8F0',
    background: active ? '#0D1F40' : 'white',
    color: active ? 'white' : '#64748B',
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={btnStyle(tab === t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── Manage Tab ── */}
      {tab === 'manage' && (
        svcLoading ? <PageLoader label="Loading services…" /> :
        svcError ? <ErrorBanner msg={svcError} onRetry={loadServices} /> :
        <div className="erp-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: '#0D1F40' }}>Service Catalogue</div>
            <button className="btn-primary" onClick={openAdd}>+ Add Service</button>
          </div>
          {services.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>No services yet. Add your first service.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="erp-table">
                <thead><tr><th>Service Name</th><th>Description</th><th style={{ textAlign: 'right' }}>Price</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {services.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: '#1E293B' }}>{s.name}</td>
                      <td style={{ color: '#64748B', fontSize: 12.5 }}>{s.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(s.price)}</td>
                      <td>
                        <button onClick={() => toggleActive(s)} style={{ padding: '3px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: s.is_active ? '#D1FAE5' : '#F1F5F9', color: s.is_active ? '#065F46' : '#64748B' }}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEdit(s)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                          <button onClick={() => handleDelete(s.id)} style={{ padding: '4px 9px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', color: '#991B1B', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bill to Room Tab ── */}
      {tab === 'bill' && (
        roomsLoading ? <PageLoader label="Loading rooms…" /> :
        roomsError ? <ErrorBanner msg={roomsError} onRetry={loadRooms} /> :
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Left: room selector + service grid */}
          <div>
            {/* Room selector card */}
            <div className="erp-card" style={{ marginBottom: 16 }}>
              <div style={{ padding: '13px 20px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>Select Room</div>
                <button onClick={loadRooms} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'white', opacity: 0.7 }} title="Refresh">🔄</button>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Dropdown: room number — guest name */}
                <Field label="Select from checked-in rooms">
                  {occupiedRooms.length === 0
                    ? <div style={{ fontSize: 13, color: '#94A3B8', padding: '8px 0' }}>No occupied rooms right now.</div>
                    : <select
                        className="erp-input"
                        value={occupiedRooms.some(r => r.room_number === selectedRoom) ? selectedRoom : ''}
                        onChange={e => { setSelectedRoom(e.target.value); setManualRoom('') }}
                      >
                        <option value="">— Select room —</option>
                        {occupiedRooms.map(r => (
                          <option key={r.room_number} value={r.room_number}>
                            Room {r.room_number} — {r.guest_name}
                          </option>
                        ))}
                      </select>
                  }
                </Field>
                {/* Manual override */}
                <Field label="Or type room number manually">
                  <input
                    className="erp-input"
                    placeholder="e.g. 204"
                    value={manualRoom}
                    onChange={e => { setManualRoom(e.target.value); if (e.target.value) setSelectedRoom('') }}
                  />
                </Field>
                {effectiveRoom && (
                  <div style={{ fontSize: 12.5, color: '#065F46', background: '#D1FAE5', padding: '6px 10px', borderRadius: 6, fontWeight: 600 }}>
                    ✓ Billing to Room {effectiveRoom}
                    {occupiedRooms.find(r => r.room_number === effectiveRoom) && (
                      <span style={{ fontWeight: 400, color: '#047857' }}> — {occupiedRooms.find(r => r.room_number === effectiveRoom)?.guest_name}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Service grid */}
            <div className="erp-card">
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: '#0D1F40' }}>Available Services</div>
              </div>
              {activeServices.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No active services. Add services in the Services tab first.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, padding: 16 }}>
                  {activeServices.map(s => {
                    const inBill = billItems.find(i => i.service.id === s.id)
                    return (
                      <div
                        key={s.id}
                        onClick={() => addItem(s)}
                        style={{ border: '1.5px solid', borderColor: inBill ? '#0D1F40' : '#E2E8F0', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', background: inBill ? '#EFF2F8' : 'white', transition: 'all 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#C9A84C')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = inBill ? '#0D1F40' : '#E2E8F0')}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40', marginBottom: 4 }}>{s.name}</div>
                        {s.description && <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 6 }}>{s.description}</div>}
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#C9A84C' }}>{fmt(s.price)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: bill summary */}
          <div className="erp-card" style={{ position: 'sticky', top: 80 }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>
                Bill — Room {effectiveRoom || '…'}
              </div>
            </div>
            <div style={{ padding: 16 }}>
              {billItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>Tap a service to add it</div>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  {billItems.map(({ service, quantity }) => (
                    <div key={service.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{service.name}</div>
                        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{fmt(service.price)} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => updateQty(service.id, quantity - 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{quantity}</span>
                        <button onClick={() => updateQty(service.id, quantity + 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1F40', minWidth: 60, textAlign: 'right' }}>{fmt(service.price * quantity)}</div>
                    </div>
                  ))}
                </div>
              )}

              {billItems.length > 0 && (
                <>
                  {/* Total */}
                  <div style={{ background: '#F8F9FC', borderRadius: 8, padding: '10px 12px', border: '1px solid #E2E8F0', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
                      <span>Total</span><span style={{ color: '#C9A84C' }}>{fmt(billSubtotal)}</span>
                    </div>
                  </div>

                  {/* Paid / Unpaid toggle */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Status</div>
                    <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #E2E8F0' }}>
                      <button
                        onClick={() => setIsPaid(false)}
                        style={{ flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: !isPaid ? '#FEF3C7' : 'white', color: !isPaid ? '#92400E' : '#64748B', borderRight: '1px solid #E2E8F0', transition: 'all 0.15s' }}
                      >
                        Unpaid
                      </button>
                      <button
                        onClick={() => setIsPaid(true)}
                        style={{ flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: isPaid ? '#D1FAE5' : 'white', color: isPaid ? '#065F46' : '#64748B', transition: 'all 0.15s' }}
                      >
                        Paid
                      </button>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 6, lineHeight: 1.5 }}>
                      {isPaid
                        ? '✓ Amount will appear in invoice as already collected — not payable at checkout.'
                        : '⏳ Amount will be added to guest folio and collected at checkout.'}
                    </div>
                  </div>
                </>
              )}

              {postError && <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12.5, color: '#991B1B' }}>⚠️ {postError}</div>}
              {postSuccess && <div style={{ marginBottom: 12, padding: '10px 12px', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12.5, color: '#065F46', fontWeight: 600 }}>✓ Charges posted to Room {effectiveRoom}</div>}

              <button
                className="btn-primary"
                onClick={postToRoom}
                disabled={posting || billItems.length === 0 || !effectiveRoom}
                style={{ width: '100%', padding: '12px', fontSize: 14 }}
              >
                {posting ? 'Posting…' : `Post to Room ${effectiveRoom || '…'}`}
              </button>

              {billItems.length > 0 && (
                <button onClick={() => setBillItems([])} style={{ width: '100%', marginTop: 8, padding: '10px', fontSize: 13, background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, cursor: 'pointer', color: '#64748B' }}>Clear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        histLoading ? <PageLoader label="Loading history…" /> :
        histError ? <ErrorBanner msg={histError} onRetry={loadHistory} /> :
        <div className="erp-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: '#0D1F40' }}>Service History ({filteredHistory.length})</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 13 }}>🔍</span>
                <input className="erp-input" placeholder="Search guest, room, service…" value={histSearch} onChange={e => setHistSearch(e.target.value)} style={{ paddingLeft: 30, width: 220 }} />
              </div>
              <button onClick={loadHistory} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13, color: '#64748B' }}>🔄</button>
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🛎️</div>
              No service charges found{histSearch ? ` for "${histSearch}"` : ' yet'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="erp-table">
                <thead>
                  <tr><th>Date</th><th>Guest</th><th>Room</th><th>Service</th><th style={{ textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit Price</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredHistory.map(h => {
                    const isPaidEntry = h.description.includes('(Paid)')
                    return (
                      <tr key={h.id}>
                        <td style={{ fontSize: 12.5, color: '#64748B', whiteSpace: 'nowrap' }}>{new Date(h.charge_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                              {h.guest_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                            {h.guest_name}
                          </div>
                        </td>
                        <td><span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#0D1F40' }}>#{h.room_number}</span></td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{h.description.replace(' (Paid)', '')}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{h.quantity}</td>
                        <td style={{ textAlign: 'right', color: '#475569' }}>{fmt(h.unit_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#C9A84C' }}>{fmt(h.net_amount)}</td>
                        <td>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: isPaidEntry ? '#D1FAE5' : '#FEF3C7', color: isPaidEntry ? '#065F46' : '#92400E' }}>
                            {isPaidEntry ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredHistory.length > 0 && (
            <div style={{ padding: '12px 20px', borderTop: '2px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 24, background: '#F8F9FC', borderRadius: '0 0 10px 10px' }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>{filteredHistory.length} charge(s)</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
                Total: <span style={{ color: '#C9A84C' }}>{fmt(filteredHistory.reduce((s, h) => s + h.net_amount, 0))}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Service modal */}
      {showModal && (
        <Modal title={editSvc ? 'Edit Service' : 'Add Service'} onClose={() => setShowModal(false)} maxWidth={480}>
          <div>
            {saveError && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>⚠️ {saveError}</div>}
            <div style={{ display: 'grid', gap: 14 }}>
              <Field label="Service Name">
                <input className="erp-input" placeholder="e.g. Airport Transfer" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="Description (optional)">
                <input className="erp-input" placeholder="e.g. One-way drop to airport" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </Field>
              <Field label="Price (₹)">
                <input className="erp-input" type="number" min={0} placeholder="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, color: '#475569' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: '#C9A84C', width: 15, height: 15 }} />
                Active (visible in Bill to Room tab)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editSvc ? 'Update' : 'Add Service'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
