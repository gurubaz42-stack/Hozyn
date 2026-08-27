import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, type DbReservation, type DbGuest, type DbRoom } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt, statusLabel } from '../data'
import { Modal, Field, StatusBadge, PageLoader, ErrorBanner } from '../ui'

type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'pending'

interface ReservationRow {
  id: string
  reservation_number: string | null
  guest_name: string
  phone: string | null
  room_number: string
  type_name: string
  check_in: string
  expected_check_out: string
  adults: number
  children: number
  special_requests: string | null
  status: string
  rate_per_night: number
  created_at: string
  guest_id: string
  room_id: string
  booking_category: string | null
  guest_photo_url: string | null
}

export default function Reservations({ onNavigate }: { onNavigate?: (m: string, resId?: string, action?: string) => void }) {
  const [reservations, setReservations] = useState<ReservationRow[]>([])
  const [guests, setGuests] = useState<DbGuest[]>([])
  const [availableRooms, setAvailableRooms] = useState<DbRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('checked_in')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  // Switch room
  const [switchRes, setSwitchRes] = useState<ReservationRow | null>(null)
  const [switchRoomId, setSwitchRoomId] = useState('')
  const [switchRooms, setSwitchRooms] = useState<DbRoom[]>([])
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  // Extend checkout
  const [extendRes, setExtendRes] = useState<ReservationRow | null>(null)
  const [newCheckout, setNewCheckout] = useState('')
  const [newExtendRate, setNewExtendRate] = useState<string>('')
  const [extendIsPaid, setExtendIsPaid] = useState(false)
  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)
  // Detail view
  const [viewRes, setViewRes] = useState<ReservationRow | null>(null)
  const [viewDocs, setViewDocs] = useState<{ file_url: string; file_name: string | null }[]>([])
  const [viewDocsLoading, setViewDocsLoading] = useState(false)
  // Guest search
  const [guestQuery, setGuestQuery] = useState('')
  const [selectedGuestName, setSelectedGuestName] = useState('')
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [bookingCategories, setBookingCategories] = useState<string[]>([])
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [guestPhotoFile, setGuestPhotoFile] = useState<File | null>(null)
  const [guestPhotoPreview, setGuestPhotoPreview] = useState<string | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [form, setForm] = useState<{
    guest_id: string; room_id: string; room_number: string
    check_in: string; expected_check_out: string
    adults: number; children: number; special_requests: string
    rate_per_night: number; status: ReservationStatus
    is_prepaid: boolean; pay_method: string
    booking_category: string
  }>({ guest_id: '', room_id: '', room_number: '', check_in: '', expected_check_out: '', adults: 1, children: 0, special_requests: '', rate_per_night: 0, status: 'confirmed', is_prepaid: false, pay_method: 'cash', booking_category: '' })

  const startCamera = () => {
    window.open('/camera.html', 'guestCamera', 'width=560,height=520,top=80,left=200')
  }
  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    cameraStreamRef.current = null
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [resRes, guestsRes, roomsRes, bCatRes] = await Promise.all([
      supabase.from('reservations').select(`
        id, reservation_number, check_in, expected_check_out,
        adults, children, special_requests, status, rate_per_night, created_at, guest_id, room_id, booking_category, guest_photo_url,
        guests(guest_name, phone),
        rooms(room_number)
      `).order('created_at', { ascending: false }),
      supabase.from('guests').select('id, guest_name, phone, is_blocked').order('guest_name'),
      supabase.from('rooms').select('id, room_number, room_status, rate_per_night').eq('room_status', 'available'),
      supabase.from('guest_options').select('value').eq('type', 'booking_category').order('value'),
    ])
    setBookingCategories((bCatRes.data || []).map((o: { value: string }) => o.value))
    if (resRes.error) { setError(resRes.error.message); setLoading(false); return }
    const rows: ReservationRow[] = (resRes.data || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      reservation_number: r.reservation_number as string | null,
      guest_name: (r.guests as { guest_name?: string } | null)?.guest_name ?? 'Unknown',
      phone: (r.guests as { phone?: string } | null)?.phone ?? null,
      room_number: (r.rooms as { room_number?: string } | null)?.room_number ?? '—',
      type_name: '—',
      check_in: r.check_in as string,
      expected_check_out: r.expected_check_out as string,
      adults: r.adults as number,
      children: r.children as number,
      special_requests: r.special_requests as string | null,
      status: r.status as string,
      rate_per_night: (r.rate_per_night as number) ?? 0,
      created_at: r.created_at as string,
      guest_id: r.guest_id as string,
      room_id: r.room_id as string,
      booking_category: r.booking_category as string | null,
      guest_photo_url: r.guest_photo_url as string | null,
    }))
    setReservations(rows)
    setGuests((guestsRes.data || []) as DbGuest[])
    setAvailableRooms((roomsRes.data || []) as DbRoom[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const applyPhoto = (dataUrl: string) => {
      try {
        const arr = dataUrl.split(',')
        const mime = arr[0].match(/:(.*?);/)![1]
        const bstr = atob(arr[1])
        const u8 = new Uint8Array(bstr.length)
        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i)
        const blob = new Blob([u8], { type: mime })
        const file = new File([blob], `guest-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setGuestPhotoFile(file)
        setGuestPhotoPreview(URL.createObjectURL(blob))
      } catch (err) { console.error('Photo decode error', err) }
    }

    // 1. BroadcastChannel — works in top-level windows
    const channel = new BroadcastChannel('guest_photo_channel')
    channel.onmessage = (e) => { if (e.data?.type === 'GUEST_PHOTO_CAPTURED') applyPhoto(e.data.dataUrl) }

    // 2. localStorage storage event — works across iframe boundaries (same origin)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'guest_photo_capture' && e.newValue) {
        try { applyPhoto(JSON.parse(e.newValue).dataUrl) } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)

    // 3. postMessage fallback
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'GUEST_PHOTO_CAPTURED') applyPhoto(e.data.dataUrl) }
    window.addEventListener('message', onMessage)

    return () => { channel.close(); window.removeEventListener('storage', onStorage); window.removeEventListener('message', onMessage) }
  }, [])

  useEffect(() => {
    if (!viewRes) { setViewDocs([]); return }
    setViewDocsLoading(true)
    supabase.from('reservation_documents')
      .select('file_url, file_name')
      .eq('reservation_id', viewRes.id)
      .order('created_at')
      .then(({ data }) => { setViewDocs(data || []); setViewDocsLoading(false) })
  }, [viewRes])
  useRealtime(['reservations', 'guests', 'rooms', 'folios', 'folio_charges', 'payments'], load)

  const statuses = ['all', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'pending']
  const filtered = reservations
    .filter(r => filter === 'all' || r.status === filter)
    .filter(r => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        (r.guest_name || '').toLowerCase().includes(q) ||
        (r.room_number || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q) ||
        (r.reservation_number || '').toLowerCase().includes(q)
      )
    })

  const nights = (r: ReservationRow) =>
    Math.max(1, Math.ceil((new Date(r.expected_check_out).getTime() - new Date(r.check_in).getTime()) / 86400000))

  const updateStatus = async (id: string, status: ReservationStatus) => {
    const reservation = reservations.find(r => r.id === id)
    const { error: err } = await supabase.from('reservations').update({ status }).eq('id', id)
    if (err) { alert('Error: ' + err.message); return }

    // Sync room status
    if (reservation?.room_id) {
      const roomStatus = status === 'checked_in' ? 'occupied'
        : status === 'cancelled' ? 'available'
        : status === 'checked_out' ? 'cleaning'
        : null
      if (roomStatus) {
        const roomUpdate: Record<string, string> = { room_status: roomStatus }
        if (status === 'checked_out') roomUpdate.housekeeping_status = 'dirty'
        await supabase.from('rooms').update(roomUpdate).eq('id', reservation.room_id)
      }
    }

    // On check-in: create folio + post room charge if no folio exists yet
    if (status === 'checked_in' && reservation) {
      const nights = Math.max(1, Math.round(
        (new Date(reservation.expected_check_out).getTime() - new Date(reservation.check_in).getTime()) / 86400000
      ))
      const roomTotal = reservation.rate_per_night * nights

      // Find or create folio
      let folioId: string | null = null
      const { data: existingFolio } = await supabase
        .from('folios').select('id').eq('reservation_id', id).maybeSingle()

      if (existingFolio) {
        folioId = existingFolio.id
      } else {
        const { data: newFolio } = await supabase
          .from('folios')
          .insert({ reservation_id: id, guest_id: reservation.guest_id })
          .select('id').single()
        if (newFolio) folioId = newFolio.id
      }

      // Post room charge if not already posted
      if (folioId) {
        const { data: existing } = await supabase
          .from('folio_charges').select('id').eq('folio_id', folioId).eq('charge_type', 'room').maybeSingle()
        if (!existing) {
          await supabase.from('folio_charges').insert({
            folio_id: folioId,
            charge_type: 'room',
            description: `Room ${reservation.room_number} — ${nights} night(s) × ${fmt(reservation.rate_per_night)}`,
            quantity: nights,
            unit_price: reservation.rate_per_night,
          })
        }
      }
    }

    load()
  }

  const handleSave = async () => {
    if (!form.guest_id || !form.room_id || !form.check_in || !form.expected_check_out) return
    setSaving(true)

    // Block new reservation if guest has any active (pending/confirmed/checked_in) reservation
    const { data: activeRes } = await supabase
      .from('reservations')
      .select('id, status, rooms(room_number)')
      .eq('guest_id', form.guest_id)
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .limit(1)
      .maybeSingle()
    if (activeRes) {
      const room = (activeRes.rooms as any)?.room_number ?? '—'
      const statusLabel = activeRes.status === 'checked_in' ? 'currently checked in to' : 'has an active reservation for'
      alert(`This guest ${statusLabel} Room ${room}. Please extend their stay or complete checkout before creating a new reservation.`)
      setSaving(false); return
    }

    const { data: newRes, error: err } = await supabase.from('reservations').insert({
      guest_id: form.guest_id,
      room_id: form.room_id,
      check_in: form.check_in,
      expected_check_out: form.expected_check_out,
      adults: form.adults,
      children: form.children,
      special_requests: form.special_requests || null,
      rate_per_night: form.rate_per_night,
      status: form.status,
      booking_category: form.booking_category || null,
    }).select('id').single()
    if (err) { alert('Error: ' + err.message); setSaving(false); return }

    // Close modal immediately after insert — prevents any chance of duplicate submit
    setShowModal(false)
    setFilter('confirmed')
    setDocFiles([]); setGuestPhotoFile(null); setGuestPhotoPreview(null)
    setForm({ guest_id: '', room_id: '', room_number: '', check_in: '', expected_check_out: '', adults: 1, children: 0, special_requests: '', rate_per_night: 0, status: 'confirmed', is_prepaid: false, pay_method: 'cash', booking_category: '' })
    setGuestQuery(''); setSelectedGuestName(''); setSaving(false)

    // If pre-paid: create folio + room charge + payment record
    if (form.is_prepaid && newRes?.id) {
      const nights = Math.max(1, Math.ceil(
        (new Date(form.expected_check_out).getTime() - new Date(form.check_in).getTime()) / 86400000
      ))
      const roomTotal = form.rate_per_night * nights
      const { data: folio } = await supabase.from('folios')
        .insert({ reservation_id: newRes.id, guest_id: form.guest_id })
        .select('id').single()
      if (folio) {
        await supabase.from('folio_charges').insert({
          folio_id: folio.id, charge_type: 'room',
          description: `Room ${form.room_number} — ${nights} night(s) × ${fmt(form.rate_per_night)}`,
          quantity: nights, unit_price: form.rate_per_night,
        })
        await supabase.from('payments').insert({
          folio_id: folio.id,
          payment_method: form.pay_method,
          amount: roomTotal,
          payment_status: 'paid',
          notes: 'Paid at booking',
        })
      }
    }

    // Upload guest photo
    if (guestPhotoFile && newRes?.id) {
      const ext = guestPhotoFile.name.split('.').pop()
      const path = `${newRes.id}/guest-photo.${ext}`
      const { data: photoUp } = await supabase.storage.from('reservation-docs').upload(path, guestPhotoFile, { upsert: true })
      if (photoUp) {
        const { data: urlData } = supabase.storage.from('reservation-docs').getPublicUrl(path)
        await supabase.from('reservations').update({ guest_photo_url: urlData.publicUrl }).eq('id', newRes.id)
      }
    }

    // Upload ID documents
    if (docFiles.length > 0 && newRes?.id) {
      await Promise.all(docFiles.map((f, i) => {
        const ext = f.name.split('.').pop()
        const path = `${newRes.id}/doc-${i + 1}-${Date.now()}.${ext}`
        return supabase.storage.from('reservation-docs').upload(path, f, { upsert: true }).then(async ({ data }) => {
          if (data) {
            const { data: urlData } = supabase.storage.from('reservation-docs').getPublicUrl(path)
            await supabase.from('reservation_documents').insert({ reservation_id: newRes.id, file_url: urlData.publicUrl, file_name: f.name })
          }
        })
      }))
    }

    load()
  }

  const openSwitch = async (r: ReservationRow) => {
    setSwitchError(null); setSwitchRoomId(''); setSwitchRes(r)
    // Fetch available rooms (exclude current room)
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, room_status, rate_per_night, room_type_id')
      .eq('room_status', 'available')
      .neq('id', r.room_id)
      .order('room_number')
    setSwitchRooms((data || []) as DbRoom[])
  }

  const handleSwitch = async () => {
    if (!switchRes || !switchRoomId) return
    setSwitching(true); setSwitchError(null)

    // Update reservation to new room
    const { error: resErr } = await supabase
      .from('reservations')
      .update({ room_id: switchRoomId })
      .eq('id', switchRes.id)
    if (resErr) { setSwitchError(resErr.message); setSwitching(false); return }

    // Mark old room as cleaning / dirty
    await supabase.from('rooms')
      .update({ room_status: 'cleaning', housekeeping_status: 'dirty' })
      .eq('id', switchRes.room_id)

    // Mark new room as occupied
    await supabase.from('rooms')
      .update({ room_status: 'occupied' })
      .eq('id', switchRoomId)

    // Update folio charge description if a room charge exists
    const newRoom = switchRooms.find(r => (r as unknown as { id: string }).id === switchRoomId)
    if (newRoom) {
      const { data: folio } = await supabase
        .from('folios').select('id').eq('reservation_id', switchRes.id).maybeSingle()
      if (folio) {
        const n = Math.max(1, Math.round(
          (new Date(switchRes.expected_check_out).getTime() - new Date(switchRes.check_in).getTime()) / 86400000
        ))
        await supabase.from('folio_charges')
          .update({ description: `Room ${newRoom.room_number} — ${n} night(s) × ${fmt(switchRes.rate_per_night)}` })
          .eq('folio_id', folio.id)
          .eq('charge_type', 'room')
          .not('description', 'like', '%Extension%')
      }
    }

    setSwitching(false); setSwitchRes(null); load()
  }

  const openExtend = (r: ReservationRow) => {
    setExtendRes(r); setNewCheckout(r.expected_check_out); setNewExtendRate(String(r.rate_per_night)); setExtendIsPaid(false); setExtendError(null)
  }

  const handleExtend = async () => {
    if (!extendRes || !newCheckout) return
    if (newCheckout <= extendRes.expected_check_out) { setExtendError('New checkout date must be after current checkout date.'); return }
    const rate = parseFloat(newExtendRate) || extendRes.rate_per_night
    if (rate <= 0) { setExtendError('Rate per night must be greater than 0.'); return }
    setExtending(true); setExtendError(null)

    const extraNights = Math.round(
      (new Date(newCheckout).getTime() - new Date(extendRes.expected_check_out).getTime()) / 86400000
    )
    const extraAmount = extraNights * rate

    // Update reservation checkout date
    const { error: err } = await supabase.from('reservations')
      .update({ expected_check_out: newCheckout })
      .eq('id', extendRes.id)
    if (err) { setExtendError(err.message); setExtending(false); return }

    // Ensure folio exists, create if missing
    let folioId: string | null = null
    const { data: existingFolio } = await supabase.from('folios').select('id').eq('reservation_id', extendRes.id).maybeSingle()
    if (existingFolio) {
      folioId = existingFolio.id
    } else {
      const { data: newFolio } = await supabase.from('folios').insert({ reservation_id: extendRes.id }).select('id').single()
      if (newFolio) folioId = newFolio.id
    }

    if (folioId) {
      // Insert a separate extension charge (keeps original charge intact)
      await supabase.from('folio_charges').insert({
        folio_id: folioId,
        charge_type: 'room',
        description: `Room ${extendRes.room_number} — Extension: ${extraNights} night(s) × ${fmt(rate)}${extendIsPaid ? ' [Paid]' : ''}`,
        quantity: extraNights,
        unit_price: rate,
      })

      // If paid upfront, record a matching payment so it nets to zero in checkout
      if (extendIsPaid) {
        await supabase.from('payments').insert({
          folio_id: folioId,
          amount: extraAmount,
          payment_method: 'cash',
          payment_status: 'paid',
          notes: `Extension paid upfront — Room ${extendRes.room_number}, ${extraNights} night(s) × ${fmt(rate)}`,
        })
      }
    }

    setExtending(false); setExtendRes(null); load()
  }

  const extendNights = extendRes && newCheckout > extendRes.expected_check_out
    ? Math.round((new Date(newCheckout).getTime() - new Date(extendRes.expected_check_out).getTime()) / 86400000)
    : 0
  const extendRate = parseFloat(newExtendRate) || extendRes?.rate_per_night || 0

  const openModal = () => {
    setForm({ guest_id: '', room_id: '', room_number: '', check_in: '', expected_check_out: '', adults: 1, children: 0, special_requests: '', rate_per_night: 0, status: 'confirmed', is_prepaid: false, pay_method: 'cash', booking_category: '' })
    setGuestQuery(''); setSelectedGuestName(''); setShowGuestDropdown(false)
    setShowModal(true)
  }

  if (loading) return <PageLoader label="Loading reservations…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div className="erp-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
            Reservations ({filtered.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94A3B8' }}>🔍</span>
              <input
                className="erp-input"
                placeholder="Search guest, room, mobile…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 220 }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#94A3B8', lineHeight: 1 }}>×</button>
              )}
            </div>
            {/* Status filters */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {statuses.map(s => (
                <button key={s} onClick={() => setFilter(s)} style={{ padding: '4px 11px', borderRadius: 16, border: '1.5px solid', borderColor: filter === s ? '#0D1F40' : '#E2E8F0', background: filter === s ? '#0D1F40' : 'white', color: filter === s ? 'white' : '#64748B', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {s === 'all' ? 'All' : statusLabel(s)}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={openModal}>+ New Reservation</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Res #</th><th>Guest</th><th>Room</th><th>Check In</th>
                <th>Check Out</th><th>Nights</th><th>Rate/Night</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No reservations found</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} onDoubleClick={() => setViewRes(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#0D1F40' }}>
                    {r.reservation_number || r.id.slice(0, 8)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.guest_name}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#0D1F40' }}>#{r.room_number}</span>{' '}
                    <span style={{ color: '#94A3B8', fontSize: 12 }}>{r.type_name}</span>
                  </td>
                  <td>{r.check_in}</td>
                  <td>{r.expected_check_out}</td>
                  <td style={{ textAlign: 'center' }}>{nights(r)}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(r.rate_per_night)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    {r.status === 'confirmed' && (
                      <button onClick={() => updateStatus(r.id, 'checked_in')} style={{ padding: '4px 8px', background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                        Check In
                      </button>
                    )}
                    {r.status === 'checked_in' && (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => openExtend(r)} style={{ padding: '4px 8px', background: '#EFF2F8', color: '#0D1F40', border: '1px solid #C7D2E8', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          Extend
                        </button>
                        <button onClick={() => openSwitch(r)} style={{ padding: '4px 8px', background: '#FEF7E4', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          🔄 Switch Room
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewRes && (
        <Modal title="Reservation Details" onClose={() => setViewRes(null)} maxWidth={600}>
          {(() => {
            const r = viewRes
            const n = nights(r)
            const total = r.rate_per_night * n
            const rows: [string, string][] = [
              ['Booking ID',    r.reservation_number || r.id.slice(0, 8).toUpperCase()],
              ['Room',          `#${r.room_number} — ${r.type_name}`],
              ['Check-in',      r.check_in],
              ['Check-out',     r.expected_check_out],
              ['Nights',        String(n)],
              ['Adults',        String(r.adults)],
              ['Children',      String(r.children)],
              ['Phone',         r.phone || '—'],
              ['Rate / Night',  `₹${r.rate_per_night.toLocaleString('en-IN')}`],
              ['Total Amount',  `₹${total.toLocaleString('en-IN')}`],
              ['Booking Category', r.booking_category || '—'],
              ['Special Requests', r.special_requests || '—'],
              ['Created At',    new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
            ]
            const statusColors: Record<string, { bg: string; color: string }> = {
              confirmed:   { bg: '#EFF6FF', color: '#1D4ED8' },
              checked_in:  { bg: '#D1FAE5', color: '#065F46' },
              checked_out: { bg: '#F1F5F9', color: '#475569' },
              cancelled:   { bg: '#FEE2E2', color: '#991B1B' },
              pending:     { bg: '#FEF3C7', color: '#92400E' },
            }
            const sc = statusColors[r.status] || { bg: '#F1F5F9', color: '#475569' }
            return (
              <div>
                {/* Header: photo + name + status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {r.guest_photo_url
                      ? <img src={r.guest_photo_url} alt={r.guest_name}
                          style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2.5px solid #10B981', flexShrink: 0, cursor: 'pointer' }}
                          onClick={() => window.open(r.guest_photo_url!, '_blank')} />
                      : <div style={{ width: 72, height: 72, borderRadius: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, border: '2px dashed #CBD5E1', flexShrink: 0 }}>👤</div>
                    }
                    <div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: '#0D1F40' }}>{r.guest_name}</div>
                      {r.guest_photo_url && <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600, marginTop: 3 }}>✓ Photo on file</div>}
                    </div>
                  </div>
                  <span style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                    {r.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gap: 0, border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                  {rows.map(([label, value], i) => (
                    <div key={label} style={{ display: 'flex', borderBottom: i < rows.length - 1 ? '1px solid #F1F5F9' : 'none', background: i % 2 === 0 ? '#FAFBFC' : 'white' }}>
                      <div style={{ width: 145, padding: '9px 14px', fontSize: 11.5, fontWeight: 600, color: '#64748B', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ padding: '9px 14px', fontSize: 13, color: '#1E293B', fontWeight: label === 'Total Amount' ? 700 : 400 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* ID Documents */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>ID Proof Documents</div>
                  {viewDocsLoading
                    ? <div style={{ fontSize: 13, color: '#94A3B8' }}>Loading…</div>
                    : viewDocs.length === 0
                      ? <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>No documents attached</div>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {viewDocs.map((d, i) => {
                            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(d.file_url)
                            return (
                              <a key={i} href={d.file_url} target="_blank" rel="noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, textDecoration: 'none' }}>
                                {isImage
                                  ? <img src={d.file_url} alt={d.file_name || ''} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                                  : <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>
                                }
                                <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {d.file_name || `Document ${i + 1}`}
                                </span>
                                <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>↗ Open</span>
                              </a>
                            )
                          })}
                        </div>
                  }
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {r.status === 'confirmed' && (
                    <button onClick={() => { updateStatus(r.id, 'checked_in'); setViewRes(null) }}
                      style={{ padding: '8px 18px', background: '#10B981', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      Check In
                    </button>
                  )}
                  <button onClick={() => setViewRes(null)}
                    style={{ padding: '8px 18px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#64748B', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                    Close
                  </button>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}

      {showModal && (
        <Modal title="Create Reservation" disableBackdropClose onClose={() => { setShowModal(false); stopCamera(); setDocFiles([]); setGuestPhotoFile(null); setGuestPhotoPreview(null) }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Guest">
                <div style={{ position: 'relative' }}>
                  {selectedGuestName && form.guest_id ? (
                    // Confirmed selection pill
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#EFF2F8', border: '1.5px solid #0D1F40', borderRadius: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {selectedGuestName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#0D1F40' }}>{selectedGuestName}</span>
                      <button onClick={() => { setSelectedGuestName(''); setForm(p => ({ ...p, guest_id: '' })); setGuestQuery(''); setShowGuestDropdown(false) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94A3B8', lineHeight: 1 }}>×</button>
                    </div>
                  ) : (
                    <input
                      className="erp-input"
                      placeholder="Search by name or mobile number…"
                      value={guestQuery}
                      autoComplete="off"
                      onChange={e => { setGuestQuery(e.target.value); setShowGuestDropdown(true) }}
                      onFocus={() => setShowGuestDropdown(true)}
                      onBlur={() => setTimeout(() => setShowGuestDropdown(false), 180)}
                    />
                  )}
                  {/* Dropdown results */}
                  {showGuestDropdown && !form.guest_id && (() => {
                    const q = guestQuery.trim().toLowerCase()
                    const matches = q.length === 0 ? [] : guests.filter((g: DbGuest) =>
                      (g.guest_name || '').toLowerCase().includes(q) ||
                      (g.phone || '').includes(q)
                    ).slice(0, 6)
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1.5px solid #E2E8F0', borderRadius: 8, boxShadow: '0 8px 24px rgba(13,31,64,0.12)', marginTop: 4, overflow: 'hidden' }}>
                        {q.length === 0 ? (
                          <div style={{ padding: '12px 16px', fontSize: 13, color: '#94A3B8' }}>Type a name or mobile number…</div>
                        ) : matches.length > 0 ? (
                          matches.map((g: DbGuest) => {
                            const gId = (g as unknown as { id: string }).id
                            return (
                              <div key={gId} onMouseDown={() => {
                                if (g.is_blocked) return
                                setForm(p => ({ ...p, guest_id: gId }))
                                setSelectedGuestName(g.guest_name)
                                setGuestQuery('')
                                setShowGuestDropdown(false)
                              }} style={{ padding: '10px 16px', cursor: g.is_blocked ? 'not-allowed' : 'pointer', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10, opacity: g.is_blocked ? 0.6 : 1, background: g.is_blocked ? '#FEF2F2' : 'white' }}
                                onMouseEnter={e => { if (!g.is_blocked) e.currentTarget.style.background = '#F8F9FC' }}
                                onMouseLeave={e => { e.currentTarget.style.background = g.is_blocked ? '#FEF2F2' : 'white' }}
                              >
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: g.is_blocked ? '#FCA5A5' : '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: g.is_blocked ? '#7F1D1D' : '#C9A84C', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                  {g.guest_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0D1F40' }}>{g.guest_name}</span>
                                    {g.is_blocked && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 5px', borderRadius: 4 }}>🚫 BLOCKED</span>}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{g.is_blocked ? 'Cannot make reservations' : (g.phone || '—')}</div>
                                </div>
                              </div>
                            )
                          })
                        ) : null}
                        {q.length > 0 && matches.length === 0 && (
                          <div style={{ padding: '12px 16px', fontSize: 13, color: '#64748B' }}>No guest found for "{guestQuery}"</div>
                        )}
                        {q.length > 0 && (
                          <div onMouseDown={() => { setShowModal(false); onNavigate?.('guests', undefined, 'add') }}
                            style={{ padding: '12px 16px', cursor: 'pointer', background: '#FEF7E4', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #E2E8F0' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#FEF3C7')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#FEF7E4')}
                          >
                            <span style={{ fontSize: 18 }}>➕</span>
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400E' }}>Create New Guest</div>
                              <div style={{ fontSize: 11.5, color: '#B45309' }}>Go to Guest Management to add this guest</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Assign Room">
                <select className="erp-input" value={form.room_id} onChange={e => {
                  const r = availableRooms.find(r => (r as unknown as {id:string}).id === e.target.value)
                  setForm(p => ({ ...p, room_id: e.target.value, room_number: r?.room_number || '', rate_per_night: r?.rate_per_night || 0 }))
                }}>
                  <option value="">Select available room</option>
                  {availableRooms.map(r => (
                    <option key={(r as unknown as {id:string}).id} value={(r as unknown as {id:string}).id}>
                      Room {r.room_number} — {(r as unknown as { room_type?: string }).room_type ?? '—'} ({fmt(r.rate_per_night)}/night)
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Check In Date">
              <input className="erp-input" type="date" value={form.check_in} onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))} />
            </Field>
            <Field label="Expected Check Out">
              <input className="erp-input" type="date" value={form.expected_check_out} onChange={e => setForm(p => ({ ...p, expected_check_out: e.target.value }))} />
            </Field>
            <Field label="Rate Per Night (₹)">
              <input className="erp-input" type="number" min={0} value={form.rate_per_night}
                onChange={e => setForm(p => ({ ...p, rate_per_night: parseFloat(e.target.value) || 0 }))} />
            </Field>
            <Field label="Adults">
              <input className="erp-input" type="number" min={1} value={form.adults} onChange={e => setForm(p => ({ ...p, adults: parseInt(e.target.value) || 1 }))} />
            </Field>
            <Field label="Children">
              <input className="erp-input" type="number" min={0} value={form.children} onChange={e => setForm(p => ({ ...p, children: parseInt(e.target.value) || 0 }))} />
            </Field>
            <Field label="Booking Category">
              <select className="erp-input" value={form.booking_category} onChange={e => setForm(p => ({ ...p, booking_category: e.target.value }))}>
                <option value="">— Select category —</option>
                {bookingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                {bookingCategories.length === 0 && <option disabled>Add categories in Settings → Guest Options</option>}
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Special Requests">
                <textarea className="erp-input" placeholder="Any special requests…" value={form.special_requests} onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))} style={{ resize: 'vertical', minHeight: 56 }} />
              </Field>
            </div>
            {/* Guest Photo */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Guest Photo">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {guestPhotoPreview
                      ? <img src={guestPhotoPreview} alt="Guest" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '2.5px solid #10B981', flexShrink: 0 }} />
                      : <div style={{ width: 80, height: 80, borderRadius: 10, background: '#F1F5F9', border: '2px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>👤</div>
                    }
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {guestPhotoPreview && <span style={{ fontSize: 12.5, color: '#065F46', fontWeight: 600 }}>✓ Photo ready</span>}
                      <button type="button" onClick={startCamera}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', border: '1.5px dashed #CBD5E1', borderRadius: 7, background: '#F8F9FC', cursor: 'pointer', color: '#475569', fontWeight: 600, fontSize: 13, width: 'fit-content' }}>
                        📷 {guestPhotoPreview ? 'Retake with Camera' : 'Open Camera'}
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', border: '1.5px dashed #CBD5E1', borderRadius: 7, background: '#F8F9FC', cursor: 'pointer', color: '#475569', fontWeight: 600, fontSize: 13, width: 'fit-content' }}>
                        🖼️ {guestPhotoPreview ? 'Change File' : 'Upload from File'}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            setGuestPhotoFile(f)
                            setGuestPhotoPreview(URL.createObjectURL(f))
                            e.target.value = ''
                          }} />
                      </label>
                    </div>
                  </div>
                </div>
              </Field>
            </div>

            {/* ID Documents */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ID Proof Documents">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: '1.5px dashed #CBD5E1', borderRadius: 8, background: '#F8F9FC', cursor: 'pointer', color: '#475569', fontWeight: 600, fontSize: 13, width: 'fit-content' }}>
                    📎 Attach Documents
                    <input type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }}
                      onChange={e => {
                        const files = Array.from(e.target.files || [])
                        setDocFiles(p => [...p, ...files])
                        e.target.value = ''
                      }} />
                  </label>
                  {docFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {docFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#EFF6FF', borderRadius: 6, border: '1px solid #BFDBFE' }}>
                          <span style={{ fontSize: 14 }}>{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span style={{ fontSize: 12.5, color: '#1E3A5F', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <span style={{ fontSize: 11, color: '#64748B' }}>{(f.size / 1024).toFixed(0)} KB</span>
                          <button type="button" onClick={() => setDocFiles(p => p.filter((_, j) => j !== i))}
                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            {/* Payment status */}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ border: '1.5px solid', borderColor: form.is_prepaid ? '#10B981' : '#E2E8F0', borderRadius: 10, padding: 14, background: form.is_prepaid ? '#F0FDF4' : '#F8F9FC' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.is_prepaid ? 12 : 0 }}>
                  <div onClick={() => setForm(p => ({ ...p, is_prepaid: !p.is_prepaid }))}
                    style={{ width: 42, height: 24, borderRadius: 12, background: form.is_prepaid ? '#10B981' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 3, left: form.is_prepaid ? 20 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: form.is_prepaid ? '#065F46' : '#475569' }}>
                      {form.is_prepaid ? '✓ Room Charges Paid at Booking' : 'Payment Pending (Pay at Checkout)'}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94A3B8' }}>
                      {form.is_prepaid ? 'Only restaurant & extra services will be charged at checkout' : 'Full bill will be collected at checkout'}
                    </div>
                  </div>
                </label>
                {form.is_prepaid && (
                  <div>
                    <label className="erp-label" style={{ marginBottom: 6 }}>Payment Method</label>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {[['cash', '💵 Cash'], ['card', '💳 Card'], ['upi', '📱 UPI'], ['bank_transfer', '🏦 Bank Transfer']].map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setForm(p => ({ ...p, pay_method: id }))}
                          style={{ padding: '6px 12px', border: '1.5px solid', borderColor: form.pay_method === id ? '#10B981' : '#E2E8F0', borderRadius: 7, background: form.pay_method === id ? '#D1FAE5' : 'white', color: form.pay_method === id ? '#065F46' : '#64748B', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Bill summary */}
            {form.rate_per_night > 0 && form.check_in && form.expected_check_out && (() => {
              const n = Math.max(0, Math.ceil((new Date(form.expected_check_out).getTime() - new Date(form.check_in).getTime()) / 86400000))
              const total = n * form.rate_per_night
              return (
                <div style={{ gridColumn: '1 / -1', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0', background: form.is_prepaid ? '#F0FDF4' : '#F8F9FC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 4 }}>
                    <span>{n} night(s) × {fmt(form.rate_per_night)}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(total)}</span>
                  </div>
                  {form.is_prepaid && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#10B981', fontWeight: 600 }}>
                      <span>✓ Paid via {form.pay_method.replace('_', ' ')}</span>
                      <span>− {fmt(total)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif", borderTop: '1px solid #E2E8F0', marginTop: 8, paddingTop: 8 }}>
                    <span>Balance at Checkout</span>
                    <span style={{ color: form.is_prepaid ? '#10B981' : '#C9A84C' }}>{form.is_prepaid ? '₹0 (room paid)' : fmt(total)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Creating…' : 'Create Reservation'}
            </button>
          </div>
        </Modal>
      )}

      {switchRes && (
        <Modal title={`Switch Room — ${switchRes.guest_name}`} onClose={() => setSwitchRes(null)} maxWidth={460}>
          <div>
            <div style={{ background: '#FEF7E4', border: '1px solid #FDE68A', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ color: '#92400E', marginBottom: 2, fontWeight: 600 }}>Current Room</div>
              <div style={{ fontWeight: 700, color: '#0D1F40', fontSize: 15 }}>Room #{switchRes.room_number}</div>
              <div style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>Will be set to Cleaning after switch</div>
            </div>

            <Field label="Select New Room">
              {switchRooms.length === 0 ? (
                <div style={{ padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                  No available rooms right now. All rooms are occupied or under maintenance.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {switchRooms.map(room => {
                    const rId = (room as unknown as { id: string }).id
                    const selected = switchRoomId === rId
                    return (
                      <div key={rId} onClick={() => setSwitchRoomId(rId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1.5px solid', borderColor: selected ? '#0D1F40' : '#E2E8F0', borderRadius: 10, background: selected ? '#EFF2F8' : 'white', cursor: 'pointer', transition: 'all 0.12s' }}
                        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = '#F8F9FC' }}
                        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'white' }}
                      >
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: selected ? '#0D1F40' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          🛏️
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Room #{room.room_number}</div>
                          <div style={{ fontSize: 12, color: '#64748B' }}>{fmt(room.rate_per_night)} / night</div>
                        </div>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid', borderColor: selected ? '#0D1F40' : '#CBD5E1', background: selected ? '#0D1F40' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Field>

            {switchError && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                ⚠️ {switchError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setSwitchRes(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSwitch} disabled={switching || !switchRoomId}>
                {switching ? 'Switching…' : 'Confirm Switch'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {extendRes && (
        <Modal title={`Extend Stay — ${extendRes.guest_name}`} onClose={() => setExtendRes(null)} maxWidth={420}>
          <div>
            <div style={{ background: '#F8F9FC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ color: '#64748B', marginBottom: 4 }}>Room {extendRes.room_number} · Current checkout</div>
              <div style={{ fontWeight: 700, color: '#0D1F40', fontSize: 15 }}>{extendRes.expected_check_out}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="New Checkout Date">
                <input
                  className="erp-input"
                  type="date"
                  min={extendRes.expected_check_out}
                  value={newCheckout}
                  onChange={e => { setNewCheckout(e.target.value); setExtendError(null) }}
                />
              </Field>
              <Field label="Rate per Night (₹)">
                <input
                  className="erp-input"
                  type="number"
                  min="0"
                  placeholder={String(extendRes.rate_per_night)}
                  value={newExtendRate}
                  onChange={e => { setNewExtendRate(e.target.value); setExtendError(null) }}
                />
              </Field>
            </div>
            {/* Paid / Unpaid toggle */}
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              {([{ v: false, label: '💳 Collect at Checkout', desc: 'Added to folio — paid at checkout' }, { v: true, label: '✅ Paid Now', desc: 'Recorded as paid — shown but not charged' }] as const).map(opt => (
                <button key={String(opt.v)} type="button" onClick={() => setExtendIsPaid(opt.v)}
                  style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1.5px solid', textAlign: 'left', cursor: 'pointer',
                    borderColor: extendIsPaid === opt.v ? '#0D1F40' : '#E2E8F0',
                    background: extendIsPaid === opt.v ? '#0D1F40' : 'white',
                    color: extendIsPaid === opt.v ? 'white' : '#475569',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {extendNights > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: extendIsPaid ? '#F0FDF4' : '#EFF2F8', border: `1px solid ${extendIsPaid ? '#BBF7D0' : '#C7D2E8'}`, borderRadius: 8, fontSize: 13 }}>
                <div style={{ color: '#64748B', marginBottom: 4 }}>Extension Preview</div>
                <div style={{ fontWeight: 700, color: '#0D1F40', marginBottom: 2 }}>
                  +{extendNights} night(s) × {fmt(extendRate)} = {fmt(extendNights * extendRate)}
                </div>
                <div style={{ fontSize: 11.5, color: extendIsPaid ? '#15803D' : '#475569' }}>
                  {extendIsPaid
                    ? '✓ Will be shown in folio as paid — not included in amount due'
                    : 'Will be added to folio and collected at checkout'}
                </div>
              </div>
            )}
            {extendError && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                ⚠️ {extendError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setExtendRes(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleExtend} disabled={extending || extendNights === 0}>
                {extending ? 'Extending…' : `Extend to ${newCheckout}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
