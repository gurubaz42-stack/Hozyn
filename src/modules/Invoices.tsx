import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../data'
import { Modal, PageLoader, ErrorBanner } from '../ui'
import { printInvoice, type HotelInfo, type InvoiceCharge } from '../lib/printInvoice'
import { useRealtime } from '../lib/useRealtime'

// ─── Day Closure (moved from Reports) ────────────────────────────────────────

interface ClosureRow { category: string; label: string; amount: number; count: number }
interface ClosureRecord { date: string; closedAt: string; total: number }
const CLOSURE_KEY = 'hozyn_day_closures'
function getClosures(): ClosureRecord[] {
  try { return JSON.parse(localStorage.getItem(CLOSURE_KEY) || '[]') } catch { return [] }
}

function DayClosure() {
  const today = new Date().toISOString().split('T')[0]
  const [viewDate, setViewDate] = useState(today)
  const [rows, setRows] = useState<ClosureRow[]>([])
  const [payBreakdown, setPayBreakdown] = useState<{ method: string; amount: number }[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closures, setClosures] = useState<ClosureRecord[]>(getClosures)
  const [closing, setClosing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [closureNote, setClosureNote] = useState('')

  const isClosed = closures.some(c => c.date === viewDate)
  const closedRecord = closures.find(c => c.date === viewDate)

  const load = useCallback(async (date: string) => {
    setLoading(true); setError(null)
    const next = (() => { const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

    const [paymentsRes, paidAtSourceRes] = await Promise.all([
      supabase.from('payments').select('amount, payment_method, folio_id').gte('payment_date', date).lt('payment_date', next),
      supabase.from('folio_charges').select('charge_type, description, unit_price, quantity, tax_amount, folio_id').gte('charge_date', date).lt('charge_date', next).ilike('description', '%(Paid)%'),
    ])
    if (paymentsRes.error) { setError(paymentsRes.error.message); setLoading(false); return }

    const payments = paymentsRes.data || []
    const paidAtSource = paymentsRes.error ? [] : (paidAtSourceRes.data || [])

    const pmMap: Record<string, number> = {}
    payments.forEach((p: { amount: number; payment_method: string }) => {
      pmMap[p.payment_method || 'cash'] = (pmMap[p.payment_method || 'cash'] || 0) + Number(p.amount)
    })
    const checkoutTotal = payments.reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
    const paidAtSourceTotal = paidAtSource.reduce((s: number, c: { unit_price: number; quantity: number; tax_amount: number }) =>
      s + Number(c.unit_price) * Number(c.quantity) + Number(c.tax_amount), 0)
    if (paidAtSourceTotal > 0) pmMap['restaurant_counter'] = (pmMap['restaurant_counter'] || 0) + paidAtSourceTotal
    const dayTotal = checkoutTotal + paidAtSourceTotal

    const catMap: Record<string, { label: string; amount: number; count: number }> = {}
    const addCat = (key: string, label: string, amount: number) => {
      if (!catMap[key]) catMap[key] = { label, amount: 0, count: 0 }
      catMap[key].amount += amount; catMap[key].count += 1
    }

    const folioIds = [...new Set(payments.map((p: { folio_id: string }) => p.folio_id).filter(Boolean))]
    if (folioIds.length > 0) {
      const { data: folioCharges } = await supabase.from('folio_charges')
        .select('charge_type, description, unit_price, quantity, tax_amount, folio_id').in('folio_id', folioIds)
      const folioChargeMap: Record<string, { type: string; desc: string; amt: number }[]> = {}
      ;(folioCharges || []).forEach((c: { charge_type: string; description?: string | null; unit_price: number; quantity: number; tax_amount: number; folio_id: string }) => {
        const amt = Number(c.unit_price) * Number(c.quantity) + Number(c.tax_amount)
        if (amt <= 0) return
        if (!folioChargeMap[c.folio_id]) folioChargeMap[c.folio_id] = []
        folioChargeMap[c.folio_id].push({ type: c.charge_type, desc: c.description || '', amt })
      })
      payments.forEach((p: { amount: number; folio_id: string }) => {
        const fcharges = folioChargeMap[p.folio_id] || []
        const folioTotal = fcharges.reduce((s, c) => s + c.amt, 0)
        if (folioTotal === 0) { addCat('other', 'Other', Number(p.amount)); return }
        fcharges.forEach(c => {
          const share = (c.amt / folioTotal) * Number(p.amount)
          const isPaid = c.desc.includes('(Paid)'); const type = c.type
          if (type === 'room') addCat('room', 'Room Charges', share)
          else if (type === 'restaurant') addCat(isPaid ? 'restaurant_counter' : 'restaurant', isPaid ? 'Restaurant (Paid at Counter)' : 'Restaurant', share)
          else if (type === 'tax') addCat('tax', 'Tax Collected', share)
          else if (type === 'other') addCat('service_charge', 'Service Charge', share)
          else if (type === 'laundry') addCat('laundry', 'Laundry', share)
          else if (type === 'spa') addCat('spa', 'Spa & Wellness', share)
          else if (type === 'minibar') addCat('minibar', 'Minibar', share)
          else if (type === 'room_service') addCat('room_service', 'Room Service', share)
          else if (type !== 'discount') addCat(type, type.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()), share)
        })
      })
    }
    if (paidAtSourceTotal > 0) addCat('restaurant_counter', 'Restaurant (Paid at Counter)', paidAtSourceTotal)

    setRows(Object.entries(catMap).map(([k, v]) => ({ category: k, label: v.label, amount: Math.round(v.amount * 100) / 100, count: v.count })))
    setPayBreakdown(Object.entries(pmMap).filter(([, a]) => a > 0).map(([method, amount]) => ({ method, amount })))
    setTotal(dayTotal)
    setLoading(false)
  }, [])

  useEffect(() => { load(viewDate) }, [load, viewDate])

  const handleClose = async () => {
    setClosing(true)
    const record: ClosureRecord = { date: viewDate, closedAt: new Date().toISOString(), total }
    const updated = [...closures.filter(c => c.date !== viewDate), record]
    localStorage.setItem(CLOSURE_KEY, JSON.stringify(updated))
    setClosures(updated); setClosing(false); setShowConfirm(false); setClosureNote('')
  }

  const typeColors: Record<string, string> = {
    room: '#0D1F40', restaurant: '#C9A84C', tax: '#7C3AED', service_charge: '#0891B2',
    laundry: '#10B981', spa: '#EC4899', minibar: '#F59E0B', room_service: '#EF4444', restaurant_counter: '#EA580C',
  }
  const fmtMethod = (m: string) => ({ cash: '💵 Cash', card: '💳 Card', upi: '📱 UPI', bank_transfer: '🏦 Bank Transfer', cheque: '📄 Cheque', corporate: '🏢 Corporate', restaurant_counter: '🍽️ Restaurant Counter' }[m] || m)

  const exportCSV = () => {
    const dateLabel = new Date(viewDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const lines = [
      [`Day Closure — ${dateLabel}`], [],
      ['Category', 'Transactions', 'Amount (INR)', '% of Total'],
      ...rows.sort((a, b) => b.amount - a.amount).map(r => [r.label, r.count, r.amount.toFixed(2), total > 0 ? ((r.amount / total) * 100).toFixed(1) + '%' : '0%']),
      [], ['TOTAL', '', total.toFixed(2), '100%'], [],
      ['Payment Method Breakdown'], ['Method', 'Amount (INR)'],
      ...payBreakdown.map(p => [p.method.replace(/_/g, ' ').toUpperCase(), p.amount.toFixed(2)]),
      [], [isClosed ? `Closed at: ${new Date(closedRecord!.closedAt).toLocaleString('en-IN')}` : 'Status: Open'],
    ]
    const csv = lines.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `day-closure-${viewDate}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const exportPrint = () => {
    const dateLabel = new Date(viewDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Day Closure — ${viewDate}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#1E293B;max-width:680px;margin:0 auto}
h1{font-size:22px;color:#0D1F40;margin:0 0 4px}.sub{color:#94A3B8;font-size:13px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#0D1F40;color:white;padding:9px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
th:not(:first-child){text-align:right}td{padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:13px}
td:not(:first-child){text-align:right}tfoot td{background:#FEF7E4;font-weight:800;font-size:15px;color:#C9A84C}
.pm-row{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid #F8F9FC}
.status{display:inline-block;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:20px}
.closed{background:#D1FAE5;color:#065F46}.open{background:#FEF3C7;color:#92400E}
@media print{body{padding:0}}</style></head><body>
<h1>Day Closure Report</h1><div class="sub">${dateLabel}</div>
<div class="status ${isClosed ? 'closed' : 'open'}">${isClosed ? `✅ Closed at ${new Date(closedRecord!.closedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '⏳ Not yet closed'}</div>
<table><thead><tr><th>Category</th><th>Txns</th><th>Amount</th><th>%</th></tr></thead>
<tbody>${rows.sort((a, b) => b.amount - a.amount).map(r => `<tr><td>${r.label}</td><td>${r.count}</td><td>₹${r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>${total > 0 ? ((r.amount / total) * 100).toFixed(1) : '0'}%</td></tr>`).join('')}</tbody>
<tfoot><tr><td>Total Revenue</td><td></td><td>₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>100%</td></tr></tfoot></table>
${payBreakdown.length > 0 ? `<p style="font-weight:700;color:#0D1F40;margin:0 0 8px">Payment Methods</p>${payBreakdown.map(p => `<div class="pm-row"><span>${p.method.replace(/_/g, ' ').toUpperCase()}</span><span>₹${p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>`).join('')}` : ''}
<p style="margin-top:32px;font-size:11px;color:#94A3B8;text-align:center">Printed on ${new Date().toLocaleString('en-IN')} · HoZyn Hotel ERP</p>
</body></html>`
    const w = window.open('', '_blank', 'width=800,height=700')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400) }
  }

  return (
    <div>
      {/* Date + status bar */}
      <div className="erp-card" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <label className="erp-label">View Date</label>
          <input type="date" className="erp-input" value={viewDate} onChange={e => setViewDate(e.target.value)} style={{ width: 156 }} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20,
          background: isClosed ? '#D1FAE5' : '#FEF3C7', color: isClosed ? '#065F46' : '#92400E', fontSize: 13, fontWeight: 700 }}>
          {isClosed ? `✅ Closed at ${new Date(closedRecord!.closedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '⏳ Not yet closed'}
        </div>
        <button onClick={exportCSV} disabled={rows.length === 0}
          style={{ padding: '7px 14px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#475569', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          ⬇ CSV
        </button>
        <button onClick={exportPrint} disabled={rows.length === 0}
          style={{ padding: '7px 14px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#475569', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print
        </button>
        {!isClosed && (
          <button onClick={() => setShowConfirm(true)} disabled={rows.length === 0}
            style={{ padding: '7px 16px', background: '#C9A84C', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            🔒 Close Day
          </button>
        )}
      </div>

      {loading ? <PageLoader label="Loading day closure…" />
        : error ? <ErrorBanner msg={error} onRetry={() => load(viewDate)} />
        : rows.length === 0 ? (
          <div className="erp-card" style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#CBD5E1' }}>No revenue recorded for this date</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Total */}
            <div className="erp-card" style={{ padding: '18px 24px', background: '#0D1F40', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Total Revenue Collected</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 800, color: '#C9A84C' }}>{fmt(total)}</div>
              </div>
              <div style={{ fontSize: 13, opacity: 0.6 }}>
                {new Date(viewDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* Category breakdown */}
            <div className="erp-card">
              <div style={{ padding: '13px 20px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>Revenue by Category</div>
              </div>
              <table className="erp-table">
                <thead><tr><th>Category</th><th style={{ textAlign: 'center' }}>Transactions</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>%</th><th style={{ width: 140 }}>Share</th></tr></thead>
                <tbody>
                  {rows.sort((a, b) => b.amount - a.amount).map(r => {
                    const pct = total > 0 ? (r.amount / total) * 100 : 0
                    return (
                      <tr key={r.category}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: typeColors[r.category] || '#94A3B8', flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: '#1E293B' }}>{r.label}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: '#64748B' }}>{r.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(Math.round(r.amount))}</td>
                        <td style={{ textAlign: 'right', color: '#94A3B8', fontSize: 12 }}>{pct.toFixed(1)}%</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 7, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: typeColors[r.category] || '#94A3B8', borderRadius: 4 }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontWeight: 800 }}>Total Revenue</td>
                    <td />
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display', serif" }}>{fmt(Math.round(total))}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>100%</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment methods */}
            {payBreakdown.length > 0 && (
              <div className="erp-card">
                <div style={{ padding: '13px 20px', borderBottom: '1px solid #E2E8F0', fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Payment Methods</div>
                <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {payBreakdown.sort((a, b) => b.amount - a.amount).map(p => (
                    <div key={p.method} style={{ flex: '1 1 160px', background: '#F8F9FC', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #E2E8F0' }}>
                      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{fmtMethod(p.method)}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0D1F40' }}>{fmt(Math.round(p.amount))}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{total > 0 ? ((p.amount / total) * 100).toFixed(1) : '0'}% of total</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Confirm close modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(13,31,64,0.2)', margin: 'auto' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0D1F40', textAlign: 'center', marginBottom: 6, fontFamily: "'Playfair Display', serif" }}>Close Day</div>
            <div style={{ fontSize: 13.5, color: '#64748B', textAlign: 'center', marginBottom: 6 }}>{new Date(viewDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#C9A84C', textAlign: 'center', fontFamily: "'Playfair Display', serif", marginBottom: 18 }}>{fmt(total)}</div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</label>
              <textarea className="erp-input" rows={2} placeholder="Any notes for this closure…" value={closureNote} onChange={e => setClosureNote(e.target.value)} style={{ resize: 'none', width: '100%' }} />
            </div>
            <div style={{ background: '#F8F9FC', borderRadius: 8, padding: 12, marginBottom: 20 }}>
              {rows.map(r => (<div key={r.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#475569', marginBottom: 4 }}><span>{r.label}</span><span style={{ fontWeight: 600 }}>{fmt(r.amount)}</span></div>))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: '#0D1F40', borderTop: '1px solid #E2E8F0', paddingTop: 8, marginTop: 6 }}><span>Total</span><span style={{ color: '#C9A84C' }}>{fmt(total)}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: 10, border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', color: '#64748B', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleClose} disabled={closing} style={{ flex: 2, padding: 10, background: '#0D1F40', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{closing ? 'Closing…' : '✓ Confirm & Close Day'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

function InvoiceList() {
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

export default function Invoices() {
  const [tab, setTab] = useState<'invoices' | 'day_closure'>('invoices')

  const tabStyle = (active: boolean, color = '#0D1F40') => ({
    padding: '9px 20px', borderRadius: 8, border: '1.5px solid',
    borderColor: active ? color : '#E2E8F0',
    background: active ? color : 'white',
    color: active ? 'white' : '#64748B',
    fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
  } as React.CSSProperties)

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: '20px 24px 0' }}>
        <button style={tabStyle(tab === 'invoices')} onClick={() => setTab('invoices')}>
          🧾 Invoices
        </button>
        <button style={tabStyle(tab === 'day_closure', '#C9A84C')} onClick={() => setTab('day_closure')}>
          🔒 Day Closure
        </button>
      </div>

      {tab === 'invoices' && <InvoiceList />}
      {tab === 'day_closure' && <div style={{ padding: '0 24px 24px' }}><DayClosure /></div>}
    </div>
  )
}
