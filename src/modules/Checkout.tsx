import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../data'
import { Modal, PageLoader, ErrorBanner } from '../ui'
import { printInvoice, type HotelInfo } from '../lib/printInvoice'
import { useRealtime } from '../lib/useRealtime'

type PaymentMethod = string

interface CheckedInRes {
  id: string
  reservation_number: string | null
  check_in: string
  expected_check_out: string
  nights: number
  rate_per_night: number
  guest_name: string
  room_number: string
  room_type: string
  folio_id: string | null
  folio_number: string | null
  total_charges: number
  total_taxes: number
  grand_total: number
  guest_email: string | null
  amount_paid: number  // pre-payments already recorded
}

interface TaxConfig { id: string; tax_name: string; rate: number; is_active: boolean }

interface FolioCharge {
  id: string
  charge_type: string
  description: string
  quantity: number
  unit_price: number
  tax_amount: number
  net_amount: number
}

const chargeTypeLabel: Record<string, string> = {
  room: 'Room Charges', restaurant: 'Restaurant Charges', laundry: 'Laundry',
  room_service: 'Room Service', minibar: 'Minibar', other: 'Other',
}

const DEFAULT_HOTEL: HotelInfo = {
  hotel_name: 'HoZyn Hotel', address: '', phone: '', email: '',
  website: '', gstin: '', pan: '', star_rating: '3',
}

export default function Checkout({ initialResId }: { initialResId?: string } = {}) {
  const [guests, setGuests] = useState<CheckedInRes[]>([])
  const [charges, setCharges] = useState<FolioCharge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CheckedInRes | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDrop, setShowSearchDrop] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [payMethod, setPayMethod] = useState<PaymentMethod>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hozyn_pay_methods') || '{}')
      const defaults: Record<string, boolean> = { cash: true, card: true, upi: true, bank_transfer: true, cheque: false, corporate: true }
      const active = { ...defaults, ...saved }
      const order = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'corporate']
      return order.find(k => active[k]) || 'cash'
    } catch { return 'cash' }
  })
  const [showInvoice, setShowInvoice] = useState(false)
  const [taxes, setTaxes] = useState<TaxConfig[]>([])
  const [selectedTaxId, setSelectedTaxId] = useState<string>('')   // '' = no tax
  const [serviceCharge, setServiceCharge] = useState<number>(0)
  const [lateCheckoutRate, setLateCheckoutRate] = useState<number | null>(null) // null = use room rate
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [hotelInfo, setHotelInfo] = useState<HotelInfo>(DEFAULT_HOTEL)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    // Fetch checked-in reservations with guest and room info
    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .select(`
        id, reservation_number, check_in, expected_check_out, rate_per_night,
        guests(guest_name, email),
        rooms(room_number, room_type_id)
      `)
      .eq('status', 'checked_in')
      .order('check_in')

    if (resErr) { setError(resErr.message); setLoading(false); return }

    // Fetch room types for name lookup
    const { data: rtData } = await supabase.from('room_type').select('id, type_name')
    const rtMap = Object.fromEntries((rtData || []).map((t: { id: string; type_name: string }) => [t.id, t.type_name]))

    // Fetch folios + prior payments for these reservations
    const resIds = (resData || []).map((r: { id: string }) => r.id)
    let folioMap: Record<string, { id: string; folio_number: string | null; total_charges: number; total_taxes: number; grand_total: number }> = {}
    let paidMap: Record<string, number> = {}
    if (resIds.length > 0) {
      const folioRes = await supabase.from('folios').select('id, folio_number, reservation_id, total_charges, total_taxes, grand_total').in('reservation_id', resIds)
      ;(folioRes.data || []).forEach((f: { id: string; folio_number: string | null; reservation_id: string; total_charges: number; total_taxes: number; grand_total: number }) => {
        folioMap[f.reservation_id] = f
      })
      // Query payments by folio_id (payments table has folio_id FK, not reservation_id)
      const folioIds = Object.values(folioMap).map(f => f.id)
      if (folioIds.length > 0) {
        const payRes = await supabase.from('payments').select('folio_id, amount').in('folio_id', folioIds).eq('payment_status', 'paid')
        // Map folio_id → reservation_id for paidMap
        const folioToRes = Object.fromEntries(Object.entries(folioMap).map(([resId, f]) => [f.id, resId]))
        ;(payRes.data || []).forEach((p: { folio_id: string; amount: number }) => {
          const resId = folioToRes[p.folio_id]
          if (resId) paidMap[resId] = (paidMap[resId] || 0) + Number(p.amount)
        })
      }
    }

    const rows: CheckedInRes[] = (resData || []).map((r: {
      id: string
      reservation_number: string | null
      check_in: string
      expected_check_out: string
      rate_per_night: number
      guests?: { guest_name?: string; email?: string } | null
      rooms?: { room_number?: string; room_type_id?: string } | null
    }) => {
      const checkIn = new Date(r.check_in)
      const checkOut = new Date(r.expected_check_out)
      const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000))
      const folio = folioMap[r.id] || null
      const roomTypeId = r.rooms?.room_type_id || ''
      return {
        id: r.id,
        reservation_number: r.reservation_number,
        check_in: r.check_in,
        expected_check_out: r.expected_check_out,
        nights,
        rate_per_night: r.rate_per_night,
        guest_name: r.guests?.guest_name ?? 'Unknown',
        guest_email: r.guests?.email ?? null,
        room_number: r.rooms?.room_number ?? '—',
        room_type: rtMap[roomTypeId] ?? '—',
        folio_id: folio?.id ?? null,
        folio_number: folio?.folio_number ?? null,
        total_charges: folio?.total_charges ?? r.rate_per_night * nights,
        total_taxes: folio?.total_taxes ?? 0,
        grand_total: folio?.grand_total ?? r.rate_per_night * nights,
        amount_paid: paidMap[r.id] ?? 0,
      }
    })

    setGuests(rows)
    setSelected(prev => {
      if (initialResId) return rows.find(r => r.id === initialResId) ?? null
      // Keep current selection if still valid; never auto-select
      const keep = prev ? rows.find(r => r.id === prev.id) : null
      return keep ?? null
    })
    setLoading(false)
  }, [])

  const loadCharges = useCallback(async (folioId: string) => {
    const { data } = await supabase
      .from('folio_charges')
      .select('id, charge_type, description, quantity, unit_price, tax_amount, net_amount')
      .eq('folio_id', folioId)
      .order('created_at')
    setCharges((data || []) as FolioCharge[])
  }, [])

  useEffect(() => {
    load()
    supabase.from('hotel_settings').select('*').eq('id', 'main').maybeSingle()
      .then(({ data }) => { if (data) setHotelInfo({ ...DEFAULT_HOTEL, ...data }) })
    supabase.from('tax_config').select('id, tax_name, rate, is_active').eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setTaxes(data as TaxConfig[]) })
  }, [load])
  useRealtime(['reservations', 'folios', 'folio_charges', 'payments', 'rooms'], load)
  useEffect(() => {
    if (selected?.folio_id) loadCharges(selected.folio_id)
    else setCharges([])
  }, [selected, loadCharges])

  // Detect overdue stay — extra nights beyond expected checkout
  const todayDate = new Date().toISOString().split('T')[0]
  const extraNights = selected
    ? Math.max(0, Math.round((new Date(todayDate).getTime() - new Date(selected.expected_check_out).getTime()) / 86400000))
    : 0
  const effectiveLateRate = lateCheckoutRate !== null ? lateCheckoutRate : (selected?.rate_per_night ?? 0)
  const extraRoomCharge = extraNights > 0 && selected ? extraNights * effectiveLateRate : 0

  // Compute from loaded charges if available, else fall back to folio columns
  const isPaidCharge = (c: { description?: string | null }) => !!(c.description?.includes('(Paid)'))
  // Include ALL charges in total (paid + unpaid) so the breakdown is accurate
  const liveTotalCharges = (charges.length > 0
    ? charges.reduce((s, c) => s + Number(c.unit_price) * Number(c.quantity), 0)
    : (selected?.total_charges ?? (selected ? selected.rate_per_night * selected.nights : 0))
  ) + extraRoomCharge
  const liveTotalTaxes = charges.length > 0
    ? charges.reduce((s, c) => s + Number(c.tax_amount), 0)
    : (selected?.total_taxes ?? 0)
  // Charges already paid at point of service (restaurant paid orders etc.)
  const paidAtSourceAmount = charges
    .filter(c => isPaidCharge(c))
    .reduce((s, c) => s + Number(c.unit_price) * Number(c.quantity) + Number(c.tax_amount), 0)
  const selectedTax = taxes.find(t => t.id === selectedTaxId) ?? null
  const roomTaxBase = liveTotalCharges
  const selectedTaxAmount = selectedTax ? Math.round(liveTotalCharges * selectedTax.rate) / 100 : 0
  const alreadyPaid = (selected?.amount_paid ?? 0) + paidAtSourceAmount
  const discountAmt = selected ? Math.round((liveTotalCharges - alreadyPaid) * discount / 100) : 0
  const grandTotal = Math.max(0, liveTotalCharges + liveTotalTaxes + selectedTaxAmount + serviceCharge - alreadyPaid - discountAmt)

  const ALL_PAY_METHODS = [
    { id: 'cash', label: '💵 Cash' }, { id: 'card', label: '💳 Credit / Debit Card' },
    { id: 'upi', label: '📱 UPI / QR Code' }, { id: 'bank_transfer', label: '🏦 Bank Transfer' },
    { id: 'cheque', label: '🪙 Cheque' }, { id: 'corporate', label: '🏢 Corporate Account' },
  ]
  const payMethods = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hozyn_pay_methods') || '{}')
      const defaults: Record<string, boolean> = { cash: true, card: true, upi: true, bank_transfer: true, cheque: false, corporate: true }
      const active = { ...defaults, ...saved }
      return ALL_PAY_METHODS.filter(m => active[m.id])
    } catch { return ALL_PAY_METHODS.slice(0, 4) }
  })()

  const completeCheckout = async () => {
    if (!selected) return
    setCompleting(true); setCompleteError(null)

    // Ensure folio exists (create if missing)
    let folioId = selected.folio_id
    if (!folioId) {
      const { data: resRow2 } = await supabase.from('reservations').select('guest_id').eq('id', selected.id).single()
      const { data: newFolio } = await supabase.from('folios')
        .insert({ reservation_id: selected.id, guest_id: resRow2?.guest_id })
        .select('id').single()
      if (newFolio) folioId = newFolio.id
    }

    // Post overdue room charge to folio before payment
    if (extraNights > 0 && folioId) {
      await supabase.from('folio_charges').insert({
        folio_id: folioId,
        charge_type: 'room',
        description: `Late checkout — ${extraNights} extra night(s) × ${fmt(effectiveLateRate)}`,
        quantity: extraNights,
        unit_price: effectiveLateRate,
      })
    }

    // Post selected room tax as a folio charge
    if (selectedTax && selectedTaxAmount > 0 && folioId) {
      await supabase.from('folio_charges').insert({
        folio_id: folioId,
        charge_type: 'tax',
        description: `${selectedTax.tax_name} (${selectedTax.rate}%) on room charges`,
        quantity: 1,
        unit_price: selectedTaxAmount,
        tax_amount: 0,
      })
    }

    if (serviceCharge > 0 && folioId) {
      await supabase.from('folio_charges').insert({
        folio_id: folioId,
        charge_type: 'other',
        description: 'Service Charge',
        quantity: 1,
        unit_price: serviceCharge,
        tax_amount: 0,
      })
    }

    // Only record a payment if there's actually something to pay
    if (grandTotal > 0) {
      const { error: payErr } = await supabase.from('payments').insert({
        folio_id: folioId,
        payment_method: payMethod,
        amount: grandTotal,
        payment_status: 'paid',
        notes: discountAmt > 0 ? `Discount applied: ${fmt(discountAmt)}` : null,
      })
      if (payErr) { setCompleteError('Payment error: ' + payErr.message); setCompleting(false); return }
    }

    // Mark reservation checked out
    const { error: statusErr } = await supabase
      .from('reservations')
      .update({ status: 'checked_out', actual_check_out: new Date().toISOString().split('T')[0] })
      .eq('id', selected.id)
    if (statusErr) { setCompleteError('Status error: ' + statusErr.message); setCompleting(false); return }

    // Free up the room — fetch room_id from reservation
    const { data: resRow } = await supabase.from('reservations').select('room_id').eq('id', selected.id).single()
    if (resRow?.room_id) {
      await supabase.from('rooms').update({ room_status: 'cleaning', housekeeping_status: 'dirty' }).eq('id', resRow.room_id)
    }

    setCompleting(false); setSelected(null); setDiscount(0); setCharges([]); setLateCheckoutRate(null); setSelectedTaxId(''); setServiceCharge(0); load()
  }

  if (loading) return <PageLoader label="Loading folios…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      {guests.length === 0 ? (
        <div className="erp-card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🏨</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', marginBottom: 6 }}>No Active Check-ins</div>
          <div style={{ color: '#94A3B8', fontSize: 14 }}>There are no guests currently checked in for checkout.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          <div>
            <div className="erp-card" style={{ marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>Select Guest for Checkout</div>
              </div>
              <div style={{ padding: 16 }}>
                <label className="erp-label">Search by name or mobile number</label>
                <div style={{ position: 'relative' }}>
                  {selected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#EFF2F8', border: '1.5px solid #0D1F40', borderRadius: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {selected.guest_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0D1F40' }}>{selected.guest_name}</div>
                        <div style={{ fontSize: 11.5, color: '#64748B' }}>Room {selected.room_number} · Out: {selected.expected_check_out}</div>
                      </div>
                      <button onClick={() => { setSelected(null); setDiscount(0); setCharges([]); setSearchQuery('') }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94A3B8', lineHeight: 1 }}>×</button>
                    </div>
                  ) : (
                    <input className="erp-input" placeholder="Type guest name or mobile number…"
                      value={searchQuery} autoComplete="off"
                      onChange={e => { setSearchQuery(e.target.value); setShowSearchDrop(true) }}
                      onFocus={() => setShowSearchDrop(true)}
                      onBlur={() => setTimeout(() => setShowSearchDrop(false), 180)}
                    />
                  )}
                  {showSearchDrop && !selected && (() => {
                    const q = searchQuery.trim().toLowerCase()
                    const matches = guests.filter(g =>
                      g.guest_name.toLowerCase().includes(q) ||
                      (g.guest_email || '').toLowerCase().includes(q) ||
                      g.room_number.includes(q)
                    )
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1.5px solid #E2E8F0', borderRadius: 8, boxShadow: '0 8px 24px rgba(13,31,64,0.12)', marginTop: 4, overflow: 'hidden' }}>
                        {matches.length === 0 ? (
                          <div style={{ padding: '14px 16px', fontSize: 13, color: '#94A3B8' }}>{q ? `No checked-in guest matching "${searchQuery}"` : 'Type to search…'}</div>
                        ) : matches.map(g => (
                          <div key={g.id} onMouseDown={() => { setSelected(g); setSearchQuery(''); setShowSearchDrop(false); setDiscount(0); setCharges([]); setLateCheckoutRate(null); setSelectedTaxId(''); setServiceCharge(0) }}
                            style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FC')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                          >
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {g.guest_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0D1F40' }}>{g.guest_name}</div>
                              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Room {g.room_number} · {g.room_type} · Out: {g.expected_check_out}</div>
                            </div>
                            {g.amount_paid > 0 && (
                              <span style={{ fontSize: 11, padding: '2px 7px', background: '#D1FAE5', color: '#065F46', borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>Pre-paid</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Guest list — shown when nothing selected yet */}
            {!selected && (() => {
              const today = new Date().toISOString().split('T')[0]
              const overdue = guests.filter(g => g.expected_check_out < today)
              const todayList = guests.filter(g => g.expected_check_out === today)
              const upcoming = guests.filter(g => g.expected_check_out > today)

              const GuestCard = (g: CheckedInRes) => (
                <div key={g.id} onClick={() => { setSelected(g); setDiscount(0); setCharges([]); setLateCheckoutRate(null); setServiceCharge(0) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1.5px solid #E2E8F0', borderRadius: 10, background: 'white', cursor: 'pointer', transition: 'box-shadow 0.13s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.09)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'none'}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: g.expected_check_out < today ? '#FEE2E2' : '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: g.expected_check_out < today ? '#EF4444' : '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {g.guest_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0D1F40', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.guest_name}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>Room {g.room_number} · {g.room_type} · Out: {g.expected_check_out}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {g.expected_check_out < today && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontWeight: 700 }}>⚠ Overdue</span>
                    )}
                    {g.expected_check_out === today && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#FEF7E4', color: '#92400E', borderRadius: 6, fontWeight: 700 }}>Today</span>
                    )}
                    {g.amount_paid > 0 && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#D1FAE5', color: '#065F46', borderRadius: 6, fontWeight: 600 }}>Pre-paid</span>
                    )}
                  </div>
                </div>
              )

              const Section = ({ label, color, items }: { label: string; color: string; items: CheckedInRes[] }) => items.length === 0 ? null : (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    {label} ({items.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(GuestCard)}
                  </div>
                </div>
              )

              return (
                <div className="erp-card" style={{ padding: 20 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: '#0D1F40', marginBottom: 16 }}>
                    Pending Checkouts
                  </div>
                  {guests.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>No guests pending checkout</div>
                  ) : (
                    <>
                      <Section label="Overdue" color="#EF4444" items={overdue} />
                      <Section label="Due Today" color="#C9A84C" items={todayList} />
                      <Section label="Future Checkouts" color="#94A3B8" items={upcoming} />
                    </>
                  )}
                </div>
              )
            })()}

            {selected && (
              <div className="erp-card">
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: '#0D1F40' }}>
                    Folio — {selected.guest_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    Room {selected.room_number} · {selected.check_in} → {selected.expected_check_out} · {selected.nights} night(s)
                    {!selected.folio_id && <span style={{ color: '#F59E0B', marginLeft: 8 }}>⚠ No folio — showing estimated room charges</span>}
                  </div>
                  {extraNights > 0 && (
                    <div style={{ marginTop: 8, padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12.5, color: '#92400E' }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>⏰ Guest exceeded checkout by {extraNights} day(s)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>Late checkout rate per day:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700 }}>₹</span>
                          <input
                            type="number"
                            min={0}
                            value={lateCheckoutRate !== null ? lateCheckoutRate : effectiveLateRate}
                            onChange={e => setLateCheckoutRate(parseFloat(e.target.value) || 0)}
                            style={{ width: 100, padding: '4px 8px', border: '1.5px solid #FCD34D', borderRadius: 6, background: 'white', color: '#92400E', fontWeight: 700, fontSize: 13 }}
                          />
                          {lateCheckoutRate !== null && (
                            <button onClick={() => setLateCheckoutRate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', fontSize: 12, textDecoration: 'underline' }}>Reset to room rate</button>
                          )}
                        </div>
                        <span style={{ fontWeight: 800, color: '#D97706' }}>Total: {fmt(extraRoomCharge)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  {alreadyPaid > 0 && (
                    <div style={{ margin: '0 0 0 0', padding: '10px 20px', background: '#F0FDF4', borderBottom: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>✅</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>
                        {fmt(selected?.amount_paid ?? 0)} advance paid
                        {paidAtSourceAmount > 0 ? ` + ${fmt(paidAtSourceAmount)} paid at restaurant` : ''}
                        {' '}— deducted from balance due
                      </span>
                    </div>
                  )}
                  <table className="erp-table">
                    <thead><tr><th>Charge Type</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
                    <tbody>
                      {charges.length > 0 ? charges.map(c => {
                        const isExtension = c.charge_type === 'room' && c.description?.includes('Extension:')
                        const isPrePaidService = c.description?.includes('(Paid)')
                        const isPaid = isPrePaidService || (c.charge_type === 'room' && !isExtension && alreadyPaid > 0)
                        const displayDesc = isPrePaidService ? c.description.replace(' (Paid)', '') : c.description
                        return (
                          <tr key={c.id} style={{ opacity: isPaid ? 0.6 : 1 }}>
                            <td style={{ fontWeight: 600 }}>{chargeTypeLabel[c.charge_type] || c.charge_type}</td>
                            <td style={{ color: '#64748B', fontSize: 12.5 }}>{displayDesc}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(c.net_amount))}</td>
                            <td style={{ textAlign: 'right' }}>
                              {isPaid
                                ? <span style={{ fontSize: 11, padding: '2px 7px', background: '#D1FAE5', color: '#065F46', borderRadius: 4, fontWeight: 600 }}>Paid</span>
                                : <span style={{ fontSize: 11, padding: '2px 7px', background: '#FEF3C7', color: '#92400E', borderRadius: 4, fontWeight: 600 }}>Due</span>}
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr key="room-est">
                          <td style={{ fontWeight: 600 }}>Room Charges</td>
                          <td style={{ color: '#64748B', fontSize: 12.5 }}>{selected.nights} night(s) × {fmt(selected.rate_per_night)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(selected.rate_per_night * selected.nights)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {alreadyPaid > 0
                              ? <span style={{ fontSize: 11, padding: '2px 7px', background: '#D1FAE5', color: '#065F46', borderRadius: 4, fontWeight: 600 }}>Paid</span>
                              : <span style={{ fontSize: 11, padding: '2px 7px', background: '#FEF3C7', color: '#92400E', borderRadius: 4, fontWeight: 600 }}>Due</span>}
                          </td>
                        </tr>
                      )}
                      {extraNights > 0 && (
                        <tr key="overdue" style={{ background: '#FFFBEB' }}>
                          <td style={{ fontWeight: 600, color: '#92400E' }}>⏰ Late Checkout</td>
                          <td style={{ color: '#92400E', fontSize: 12.5 }}>{extraNights} extra night(s) × {fmt(effectiveLateRate)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#D97706' }}>{fmt(extraRoomCharge)}</td>
                          <td style={{ textAlign: 'right' }}><span style={{ fontSize: 11, padding: '2px 7px', background: '#FEF3C7', color: '#92400E', borderRadius: 4, fontWeight: 600 }}>Due</span></td>
                        </tr>
                      )}
                      <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                        <td colSpan={3} style={{ fontWeight: 700, color: '#0D1F40' }}>Total Charges</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(liveTotalCharges + liveTotalTaxes)}</td>
                      </tr>
                      {alreadyPaid > 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: '#10B981', fontWeight: 600 }}>✓ Already Paid</td>
                          <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>− {fmt(alreadyPaid)}</td>
                        </tr>
                      )}
                      {selectedTax && selectedTaxAmount > 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: '#92400E', fontWeight: 600 }}>📊 {selectedTax.tax_name} ({selectedTax.rate}%)</td>
                          <td style={{ textAlign: 'right', color: '#92400E', fontWeight: 600 }}>+ {fmt(selectedTaxAmount)}</td>
                        </tr>
                      )}
                      {serviceCharge > 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: '#7C3AED', fontWeight: 600 }}>🛎 Service Charge</td>
                          <td style={{ textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>+ {fmt(serviceCharge)}</td>
                        </tr>
                      )}
                      {discount > 0 && (
                        <tr>
                          <td colSpan={3} style={{ color: '#10B981', fontWeight: 600 }}>Discount ({discount}%)</td>
                          <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>− {fmt(discountAmt)}</td>
                        </tr>
                      )}
                      <tr style={{ background: '#FEF7E4' }}>
                        <td colSpan={3} style={{ fontWeight: 800, fontSize: 15, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
                          {alreadyPaid > 0 ? 'Amount Payable Now' : 'Grand Total'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#C9A84C', fontFamily: "'Playfair Display', serif" }}>{fmt(grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {selected && (
            <div className="erp-card" style={{ position: 'sticky', top: 80 }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>Payment</div>
              </div>
              <div style={{ padding: 16 }}>
                {/* Room Tax selector */}
                {taxes.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label className="erp-label">Room Tax</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
                        onClick={() => setSelectedTaxId('')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1.5px solid', borderColor: selectedTaxId === '' ? '#0D1F40' : '#E2E8F0', borderRadius: 8, background: selectedTaxId === '' ? '#EFF2F8' : 'white', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: selectedTaxId === '' ? '#0D1F40' : '#64748B' }}>No Tax</span>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: selectedTaxId === '' ? '#0D1F40' : '#CBD5E1', background: selectedTaxId === '' ? '#0D1F40' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedTaxId === '' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                        </div>
                      </div>
                      {taxes.map(t => (
                        <div key={t.id}
                          onClick={() => setSelectedTaxId(t.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1.5px solid', borderColor: selectedTaxId === t.id ? '#C9A84C' : '#E2E8F0', borderRadius: 8, background: selectedTaxId === t.id ? '#FEF7E4' : 'white', cursor: 'pointer' }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: selectedTaxId === t.id ? '#92400E' : '#1E293B' }}>{t.tax_name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{t.rate}% · {selectedTaxId === t.id ? fmt(Math.round(liveTotalCharges * t.rate) / 100) : `on ${fmt(liveTotalCharges)}`}</div>
                          </div>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', borderColor: selectedTaxId === t.id ? '#C9A84C' : '#CBD5E1', background: selectedTaxId === t.id ? '#C9A84C' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {selectedTaxId === t.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label className="erp-label">Discount (%)</label>
                    <input className="erp-input" type="number" min={0} max={100} value={discount}
                      onChange={e => setDiscount(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="erp-label">Service Charge (₹)</label>
                    <input className="erp-input" type="number" min={0} value={serviceCharge}
                      onChange={e => setServiceCharge(Math.max(0, parseFloat(e.target.value) || 0))} />
                  </div>
                </div>
                <div style={{ background: '#F8F9FC', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748B', marginBottom: 4 }}>
                    <span>Total Charges</span><span>{fmt(liveTotalCharges)}</span>
                  </div>
                  {liveTotalTaxes > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748B', marginBottom: 4 }}>
                      <span>Item Taxes</span><span>{fmt(liveTotalTaxes)}</span>
                    </div>
                  )}
                  {selectedTax && selectedTaxAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>
                      <span>📊 {selectedTax.tax_name} ({selectedTax.rate}%)</span><span>+ {fmt(selectedTaxAmount)}</span>
                    </div>
                  )}
                  {serviceCharge > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#7C3AED', fontWeight: 600, marginBottom: 4 }}>
                      <span>🛎 Service Charge</span><span>+ {fmt(serviceCharge)}</span>
                    </div>
                  )}
                  {(selected?.amount_paid ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#10B981', fontWeight: 600, marginBottom: 4 }}>
                      <span>✓ Advance Paid</span><span>− {fmt(selected?.amount_paid ?? 0)}</span>
                    </div>
                  )}
                  {paidAtSourceAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#10B981', fontWeight: 600, marginBottom: 4 }}>
                      <span>✓ Paid at Restaurant</span><span>− {fmt(paidAtSourceAmount)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#10B981', marginBottom: 4 }}>
                      <span>Discount ({discount}%)</span><span>− {fmt(discountAmt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif", marginTop: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                    <span>{alreadyPaid > 0 ? 'Payable Now' : 'Grand Total'}</span><span style={{ color: '#C9A84C' }}>{fmt(grandTotal)}</span>
                  </div>
                </div>
                {completeError && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12.5, color: '#991B1B' }}>
                    ⚠️ {completeError}
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <label className="erp-label" style={{ marginBottom: 8 }}>Payment Method</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {payMethods.map(({ id, label }) => (
                      <button key={id} onClick={() => setPayMethod(id as PaymentMethod)}
                        style={{ padding: '9px', border: '1.5px solid', borderColor: payMethod === id ? '#0D1F40' : '#E2E8F0', borderRadius: 7, background: payMethod === id ? '#EFF2F8' : 'white', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: payMethod === id ? '#0D1F40' : '#64748B' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn-gold" onClick={() => setShowInvoice(true)} style={{ width: '100%', padding: '12px', fontSize: 14 }}>🖨️ Preview Invoice</button>
                  <button className="btn-primary" onClick={completeCheckout} disabled={completing} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                    {completing ? 'Processing…' : '✓ Complete Checkout'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showInvoice && selected && (
        <Modal title="" onClose={() => setShowInvoice(false)} maxWidth={620}>
          <div style={{ fontFamily: "'Playfair Display', serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <img src="/src/imports/HOZYN_LOGO.png" alt="HoZyn" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0D1F40' }}>{hotelInfo.hotel_name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                    {hotelInfo.address}{hotelInfo.gstin ? ` | GST: ${hotelInfo.gstin}` : ''}{hotelInfo.pan ? ` | PAN: ${hotelInfo.pan}` : ''}
                  </div>
                  {(hotelInfo.phone || hotelInfo.email) && (
                    <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>
                      {hotelInfo.phone}{hotelInfo.phone && hotelInfo.email ? ' · ' : ''}{hotelInfo.email}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#C9A84C' }}>TAX INVOICE</div>
                <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>
                  {selected.folio_number || selected.reservation_number || 'INV-' + selected.id.slice(0, 6).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'Inter, sans-serif' }}>{new Date().toLocaleDateString('en-IN')}</div>
              </div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 18, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#0D1F40', marginBottom: 4 }}>Billed to:</div>
              <div style={{ color: '#475569' }}>{selected.guest_name} · Room {selected.room_number} ({selected.room_type})</div>
              <div style={{ color: '#475569' }}>{selected.check_in} → {selected.expected_check_out} ({selected.nights} nights)</div>
              {selected.guest_email && <div style={{ color: '#94A3B8', fontSize: 12 }}>{selected.guest_email}</div>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#0D1F40', color: 'white' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.length > 0 ? charges.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{chargeTypeLabel[c.charge_type] || c.charge_type}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>{(c.description || '').replace(' (Paid)', '')}</div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(Number(c.net_amount))}</td>
                  </tr>
                )) : (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>Room Charges</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>{selected.nights} night(s) × {fmt(selected.rate_per_night)}</div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(selected.rate_per_night * selected.nights)}</td>
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                  <td style={{ padding: '8px 12px', color: '#64748B' }}>Sub Total</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(liveTotalCharges)}</td>
                </tr>
                {liveTotalTaxes > 0 && (
                  <tr>
                    <td style={{ padding: '8px 12px', color: '#64748B' }}>Taxes & Fees</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(liveTotalTaxes)}</td>
                  </tr>
                )}
                <tr style={{ background: '#F8F9FC', borderTop: '2px solid #E2E8F0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0D1F40' }}>Grand Total</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(liveTotalCharges + liveTotalTaxes)}</td>
                </tr>
                {alreadyPaid > 0 && (
                  <tr>
                    <td style={{ padding: '8px 12px', color: '#10B981', fontWeight: 600 }}>✓ Advance Paid</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>− {fmt(alreadyPaid)}</td>
                  </tr>
                )}
                {selectedTax && selectedTaxAmount > 0 && (
                  <tr>
                    <td style={{ padding: '8px 12px', color: '#92400E', fontWeight: 600 }}>📊 {selectedTax.tax_name} ({selectedTax.rate}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#92400E', fontWeight: 600 }}>+ {fmt(selectedTaxAmount)}</td>
                  </tr>
                )}
                {serviceCharge > 0 && (
                  <tr>
                    <td style={{ padding: '8px 12px', color: '#7C3AED', fontWeight: 600 }}>🛎 Service Charge</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#7C3AED', fontWeight: 600 }}>+ {fmt(serviceCharge)}</td>
                  </tr>
                )}
                {discount > 0 && (
                  <tr>
                    <td style={{ padding: '8px 12px', color: '#10B981' }}>Discount ({discount}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981' }}>− {fmt(discountAmt)}</td>
                  </tr>
                )}
                <tr style={{ background: '#FEF7E4' }}>
                  <td style={{ padding: '12px', fontWeight: 800, fontSize: 15, color: '#0D1F40' }}>
                    {grandTotal <= 0 ? '✓ Fully Settled' : 'Balance Due'}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: grandTotal <= 0 ? '#10B981' : '#C9A84C' }}>{fmt(Math.max(0, grandTotal))}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', fontFamily: 'Inter, sans-serif', borderTop: '1px solid #E2E8F0', paddingTop: 14 }}>
              Thank you for staying at {hotelInfo.hotel_name}! Payment via: {payMethod.replace('_', ' ').toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => setShowInvoice(false)}>Close</button>
            <button className="btn-ghost" onClick={() => {
              printInvoice(hotelInfo, {
                invoiceNo: selected.folio_number || selected.reservation_number || 'INV-' + selected.id.slice(0, 6).toUpperCase(),
                date: new Date().toLocaleDateString('en-IN'),
                guestName: selected.guest_name,
                guestEmail: selected.guest_email ?? undefined,
                roomNumber: selected.room_number,
                roomType: selected.room_type,
                checkIn: selected.check_in,
                checkOut: selected.expected_check_out,
                nights: selected.nights,
                charges: charges.map(c => ({ id: c.id, charge_type: c.charge_type, description: (c.description || '').replace(' (Paid)', ''), net_amount: c.net_amount })),
                totalCharges: liveTotalCharges,
                totalTaxes: liveTotalTaxes,
                alreadyPaid,
                discount,
                discountAmt,
                serviceCharge,
                grandTotal: liveTotalCharges + liveTotalTaxes + selectedTaxAmount + serviceCharge,
                payMethod,
              })
            }} style={{ border: '1.5px solid #0D1F40', color: '#0D1F40' }}>⬇ Download PDF</button>
            <button className="btn-primary" onClick={() => { setShowInvoice(false); completeCheckout() }}>✓ Confirm & Checkout</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
