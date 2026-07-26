import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../data'
import { Modal, PageLoader, ErrorBanner } from '../ui'
import { printInvoice, type HotelInfo, type InvoiceCharge } from '../lib/printInvoice'
import { useRealtime } from '../lib/useRealtime'

interface Invoice {
  id: string
  reservation_number: string | null
  folio_number: string | null
  folio_id: string | null
  guest_name: string
  room_number: string
  room_type: string
  check_in: string
  expected_check_out: string
  nights: number
  rate_per_night: number
  grand_total: number
  amount_paid: number
  checkout_date: string | null
  guest_email: string | null
}

interface FolioCharge {
  id: string; charge_type: string; description: string; net_amount: number; quantity: number; unit_price: number; tax_amount: number
}

const DEFAULT_HOTEL: HotelInfo = {
  hotel_name: 'HoZyn Hotel', address: '', phone: '', email: '',
  website: '', gstin: '', pan: '', star_rating: '3',
}

export default function Invoices() {
  const today = new Date().toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hotelInfo, setHotelInfo] = useState<HotelInfo>(DEFAULT_HOTEL)
  const [viewInv, setViewInv] = useState<Invoice | null>(null)
  const [viewCharges, setViewCharges] = useState<FolioCharge[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [alreadyPaidMap, setAlreadyPaidMap] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)

    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .select(`
        id, reservation_number, check_in, expected_check_out, actual_check_out, rate_per_night,
        rooms(room_number, room_type(type_name)),
        guests(guest_name, email)
      `)
      .eq('status', 'checked_out')
      .gte('actual_check_out', fromDate)
      .lte('actual_check_out', toDate)
      .order('actual_check_out', { ascending: false })

    if (resErr) { setError(resErr.message); setLoading(false); return }

    const resIds = (resData || []).map((r: { id: string }) => r.id)
    let folioMap: Record<string, { id: string; folio_number: string | null }> = {}
    let chargeTotalMap: Record<string, number> = {}  // folio_id → sum of charges
    let paidMap: Record<string, number> = {}

    if (resIds.length > 0) {
      const { data: folios } = await supabase.from('folios')
        .select('id, folio_number, reservation_id').in('reservation_id', resIds)
      ;(folios || []).forEach((f: { id: string; folio_number: string | null; reservation_id: string }) => {
        folioMap[f.reservation_id] = f
      })
      const folioIds = Object.values(folioMap).map(f => f.id)
      if (folioIds.length > 0) {
        // Sum charges per folio from folio_charges
        const { data: charges } = await supabase.from('folio_charges')
          .select('folio_id, unit_price, quantity, tax_amount').in('folio_id', folioIds)
        ;(charges || []).forEach((c: { folio_id: string; unit_price: number; quantity: number; tax_amount: number }) => {
          chargeTotalMap[c.folio_id] = (chargeTotalMap[c.folio_id] || 0) + (Number(c.unit_price) * Number(c.quantity)) + Number(c.tax_amount)
        })

        const { data: pays } = await supabase.from('payments')
          .select('folio_id, amount').in('folio_id', folioIds).eq('payment_status', 'paid')
        const folioToRes = Object.fromEntries(Object.entries(folioMap).map(([rid, f]) => [f.id, rid]))
        ;(pays || []).forEach((p: { folio_id: string; amount: number }) => {
          const rid = folioToRes[p.folio_id]
          if (rid) paidMap[rid] = (paidMap[rid] || 0) + Number(p.amount)
        })
      }
    }
    setAlreadyPaidMap(paidMap)

    const rows: Invoice[] = (resData || []).map((r: {
      id: string; reservation_number: string | null; check_in: string; expected_check_out: string; actual_check_out: string | null; rate_per_night: number
      rooms: { room_number: string; room_type: { type_name: string } | null } | null
      guests: { guest_name: string; email: string | null } | null
    }) => {
      const checkoutDate = r.actual_check_out || r.expected_check_out
      const nights = Math.max(1, Math.round(
        (new Date(checkoutDate).getTime() - new Date(r.check_in).getTime()) / 86400000
      ))
      const folio = folioMap[r.id]
      const folioChargesTotal = folio ? (chargeTotalMap[folio.id] || 0) : 0
      const fallbackTotal = r.rate_per_night * nights
      return {
        id: r.id,
        reservation_number: r.reservation_number,
        folio_number: folio?.folio_number ?? null,
        folio_id: folio?.id ?? null,
        guest_name: r.guests?.guest_name ?? 'Unknown',
        room_number: r.rooms?.room_number ?? '—',
        room_type: r.rooms?.room_type?.type_name ?? '—',
        check_in: r.check_in,
        expected_check_out: r.expected_check_out,
        nights,
        rate_per_night: r.rate_per_night,
        grand_total: folioChargesTotal > 0 ? folioChargesTotal : fallbackTotal,
        amount_paid: paidMap[r.id] || 0,
        checkout_date: checkoutDate,
        guest_email: r.guests?.email ?? null,
      }
    })
    setInvoices(rows)
    setLoading(false)
  }, [fromDate, toDate])

  useEffect(() => {
    load()
    supabase.from('hotel_settings').select('*').eq('id', 'main').maybeSingle()
      .then(({ data }) => { if (data) setHotelInfo({ ...DEFAULT_HOTEL, ...data }) })
  }, [load])
  useRealtime(['reservations', 'folios', 'folio_charges', 'payments'], load)

  const openView = async (inv: Invoice) => {
    setViewInv(inv); setViewCharges([]); setLoadingCharges(true)
    if (inv.folio_id) {
      const { data } = await supabase.from('folio_charges')
        .select('id, charge_type, description, quantity, unit_price, tax_amount, net_amount')
        .eq('folio_id', inv.folio_id).order('created_at')
      setViewCharges((data || []) as FolioCharge[])
    }
    setLoadingCharges(false)
  }

  const handlePrint = (inv: Invoice, charges: FolioCharge[]) => {
    const totalCharges = charges.reduce((s, c) => s + Number(c.unit_price) * Number(c.quantity), 0) || inv.grand_total
    const totalTaxes = charges.reduce((s, c) => s + Number(c.tax_amount), 0)
    const paid = alreadyPaidMap[inv.id] || 0
    printInvoice(hotelInfo, {
      invoiceNo: inv.folio_number || inv.reservation_number || 'INV-' + inv.id.slice(0, 6).toUpperCase(),
      date: inv.checkout_date || today,
      guestName: inv.guest_name,
      guestEmail: inv.guest_email ?? undefined,
      roomNumber: inv.room_number,
      roomType: inv.room_type,
      checkIn: inv.check_in,
      checkOut: inv.expected_check_out,
      nights: inv.nights,
      charges: charges.map(c => ({ id: c.id, charge_type: c.charge_type, description: c.description, net_amount: c.net_amount } as InvoiceCharge)),
      totalCharges,
      totalTaxes,
      alreadyPaid: paid,
      discount: 0,
      discountAmt: 0,
      grandTotal: totalCharges + totalTaxes,
      payMethod: 'cash',
    })
  }

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.grand_total), 0)

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      {/* Header + filters */}
      <div className="erp-card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>
            Invoices & Billing History
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <label style={{ color: '#64748B', fontWeight: 600 }}>From</label>
              <input className="erp-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: 148 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <label style={{ color: '#64748B', fontWeight: 600 }}>To</label>
              <input className="erp-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: 148 }} />
            </div>
            <button className="btn-primary" onClick={load} style={{ fontSize: 13, padding: '8px 16px' }}>Search</button>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Invoices Found', val: invoices.length, color: '#0D1F40' },
            { label: 'Total Revenue', val: fmt(totalRevenue), color: '#C9A84C' },
          ].map(k => (
            <div key={k.label} className="erp-card" style={{ padding: '12px 20px', minWidth: 160 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <PageLoader label="Loading invoices…" /> : error ? <ErrorBanner msg={error} onRetry={load} /> : (
        <div className="erp-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr><th>Invoice #</th><th>Guest</th><th>Room</th><th>Check-in</th><th>Checkout</th><th>Nights</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {invoices.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#94A3B8' }}>No invoices found for the selected date range</td></tr>
                  : invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0D1F40' }}>
                          {inv.folio_number || inv.reservation_number || inv.id.slice(0, 8)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{inv.guest_name}</div>
                        {inv.guest_email && <div style={{ fontSize: 11, color: '#94A3B8' }}>{inv.guest_email}</div>}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>Room {inv.room_number}</span>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{inv.room_type}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{inv.check_in}</td>
                      <td style={{ fontSize: 12.5 }}>{inv.checkout_date}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{inv.nights}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(inv.grand_total)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openView(inv)} style={{ padding: '4px 10px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>View</button>
                          <button onClick={() => handlePrint(inv, [])} style={{ padding: '4px 10px', border: '1px solid #C9A84C', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#92400E' }}>⬇ PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      {viewInv && (
        <Modal title="" onClose={() => setViewInv(null)} maxWidth={640}>
          {loadingCharges ? <PageLoader label="Loading invoice…" /> : (
            <>
              <div style={{ fontFamily: "'Playfair Display', serif" }}>
                {/* Hotel header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <img src="/src/imports/HOZYN_LOGO.png" alt="HoZyn" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#0D1F40' }}>{hotelInfo.hotel_name}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, fontFamily: 'Inter, sans-serif' }}>
                        {hotelInfo.address}{hotelInfo.gstin ? ` | GST: ${hotelInfo.gstin}` : ''}
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
                    <div style={{ fontSize: 12, color: '#64748B', fontFamily: 'Inter, sans-serif', marginTop: 3 }}>
                      {viewInv.folio_number || viewInv.reservation_number || 'INV-' + viewInv.id.slice(0, 6).toUpperCase()}<br />
                      {viewInv.checkout_date}
                    </div>
                  </div>
                </div>

                {/* Guest info */}
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: '#0D1F40', marginBottom: 4 }}>Billed to:</div>
                  <div style={{ color: '#475569' }}>{viewInv.guest_name} · Room {viewInv.room_number} ({viewInv.room_type})</div>
                  <div style={{ color: '#475569' }}>{viewInv.check_in} → {viewInv.checkout_date} ({viewInv.nights} nights)</div>
                  {viewInv.guest_email && <div style={{ color: '#94A3B8', fontSize: 12 }}>{viewInv.guest_email}</div>}
                </div>

                {/* Charges table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 13, marginBottom: 16 }}>
                  <thead>
                    <tr style={{ background: '#0D1F40', color: 'white' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Description</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewCharges.length > 0 ? viewCharges.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 500 }}>{({ room: 'Room Charges', restaurant: 'Restaurant', laundry: 'Laundry', room_service: 'Room Service', minibar: 'Minibar', spa: 'Spa', other: 'Other' } as Record<string,string>)[c.charge_type] || c.charge_type}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.description}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(Number(c.net_amount))}</td>
                      </tr>
                    )) : (
                      <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 500 }}>Room Charges</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{viewInv.nights} night(s) × {fmt(viewInv.rate_per_night)}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(viewInv.rate_per_night * viewInv.nights)}</td>
                      </tr>
                    )}
                    {(() => {
                      const total = viewCharges.length > 0
                        ? viewCharges.reduce((s, c) => s + Number(c.unit_price) * Number(c.quantity), 0)
                        : viewInv.rate_per_night * viewInv.nights
                      const taxes = viewCharges.reduce((s, c) => s + Number(c.tax_amount), 0)
                      const grandTotal = total + taxes
                      return (<>
                        {taxes > 0 && (
                          <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                            <td style={{ padding: '8px 12px', color: '#64748B' }}>Taxes & Fees</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(taxes)}</td>
                          </tr>
                        )}
                        <tr style={{ background: '#FEF7E4', borderTop: '2px solid #E2E8F0' }}>
                          <td style={{ padding: '12px', fontWeight: 800, fontSize: 15, color: '#0D1F40' }}>Grand Total</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#C9A84C' }}>{fmt(grandTotal)}</td>
                        </tr>
                      </>)
                    })()}
                  </tbody>
                </table>

                <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', fontFamily: 'Inter, sans-serif', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                  Thank you for staying at {hotelInfo.hotel_name}!
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn-ghost" onClick={() => setViewInv(null)}>Close</button>
                <button className="btn-primary" style={{ background: 'white', color: '#0D1F40', border: '1.5px solid #0D1F40' }}
                  onClick={() => handlePrint(viewInv, viewCharges)}>⬇ Download PDF</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
