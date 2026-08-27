import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../data'
import { BarChartSVG, AreaChartSVG, PageLoader, ErrorBanner, Modal } from '../ui'

type ReportId = 'revenue' | 'occupancy' | 'restaurant' | 'services' | 'forecast'

const REPORTS: { id: ReportId; label: string; icon: string }[] = [
  { id: 'revenue',    label: 'Daily Revenue',      icon: '💰' },
  { id: 'occupancy',  label: 'Occupancy Report',   icon: '🛏️' },
  { id: 'restaurant', label: 'Restaurant Sales',   icon: '🍽️' },
  { id: 'services',   label: 'Service Items',      icon: '🛎️' },
  { id: 'forecast',   label: 'Forecasting',        icon: '📈' },
]

// ─── Shared helpers ──────────────────────────────────────────────────────────

function dateRange(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - (days - 1))
  return d.toISOString().split('T')[0]
}
function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
const todayStr = new Date().toISOString().split('T')[0]

function SummaryCard({ label, value, sub, color = '#0D1F40', bg = '#EFF2F8' }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string
}) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px', border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Playfair Display', serif", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  )
}

// ─── Revenue Report ───────────────────────────────────────────────────────────

type RevPeriod = '7d' | '30d' | '90d'

function RevenueReport() {
  const [period, setPeriod] = useState<RevPeriod>('30d')
  const [rows, setRows] = useState<{ date: string; room: number; restaurant: number; services: number; total: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: RevPeriod) => {
    setLoading(true); setError(null)
    const days = p === '7d' ? 7 : p === '30d' ? 30 : 90
    const from = dateRange(days)

    const { data, error } = await supabase
      .from('folio_charges')
      .select('charge_type, quantity, unit_price, net_amount, charge_date')
      .gte('charge_date', from)
      .order('charge_date')

    if (error) { setError(error.message); setLoading(false); return }

    const buckets: Record<string, { room: number; restaurant: number; services: number }> = {}
    ;(data || []).forEach((c: { charge_date: string; charge_type: string; net_amount: number }) => {
      const d = c.charge_date?.split('T')[0] ?? ''
      if (!d) return
      if (!buckets[d]) buckets[d] = { room: 0, restaurant: 0, services: 0 }
      const amt = Number(c.net_amount)
      if (c.charge_type === 'room') buckets[d].room += amt
      else if (c.charge_type === 'restaurant') buckets[d].restaurant += amt
      else buckets[d].services += amt
    })

    // Fill all days in range
    const result = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      const b = buckets[key] || { room: 0, restaurant: 0, services: 0 }
      result.push({ date: key, ...b, total: b.room + b.restaurant + b.services })
    }
    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => { load(period) }, [period])

  const chartDays = period === '7d' ? 7 : period === '30d' ? 14 : 18
  // Downsample for chart readability
  const chartData = rows.filter((_, i) => period === '7d' || i % Math.ceil(rows.length / chartDays) === 0)
    .map(r => ({ label: new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: r.total }))

  const total = rows.reduce((s, r) => s + r.total, 0)
  const roomTotal = rows.reduce((s, r) => s + r.room, 0)
  const restTotal = rows.reduce((s, r) => s + r.restaurant, 0)
  const svcTotal = rows.reduce((s, r) => s + r.services, 0)
  const activeDays = rows.filter(r => r.total > 0).length
  const avgDaily = activeDays > 0 ? total / activeDays : 0

  if (loading) return <PageLoader label="Loading revenue data…" />
  if (error) return <ErrorBanner msg={error} onRetry={() => load(period)} />

  return (
    <div>
      <div className="erp-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Daily Revenue Breakdown</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Revenue by charge type over the selected period</div>
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            {(['7d','30d','90d'] as RevPeriod[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '7px 16px', border: 'none', borderRight: p !== '90d' ? '1px solid #E2E8F0' : 'none', background: period === p ? '#0D1F40' : 'white', color: period === p ? 'white' : '#64748B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Total Revenue" value={fmt(total)} sub={`${period === '7d' ? 7 : period === '30d' ? 30 : 90}-day period`} color="#C9A84C" bg="#FEF7E4" />
          <SummaryCard label="Avg Per Active Day" value={fmt(avgDaily)} sub={`${activeDays} days with revenue`} />
          <SummaryCard label="Room Revenue" value={fmt(roomTotal)} sub={`${total > 0 ? Math.round(roomTotal / total * 100) : 0}% of total`} color="#0D1F40" />
          <SummaryCard label="Restaurant Revenue" value={fmt(restTotal)} sub={`${total > 0 ? Math.round(restTotal / total * 100) : 0}% of total`} color="#10B981" bg="#D1FAE5" />
          <SummaryCard label="Services Revenue" value={fmt(svcTotal)} sub={`${total > 0 ? Math.round(svcTotal / total * 100) : 0}% of total`} color="#8B5CF6" bg="#F3E8FF" />
        </div>
        {chartData.some(d => d.value > 0) ? (
          <BarChartSVG data={chartData} height={180} color="#0D1F40" valueLabel={v => '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
        ) : (
          <EmptyState icon="💳" text="No revenue charges found in this period" />
        )}
      </div>

      {/* Breakdown table */}
      <div className="erp-card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Daily Breakdown</div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto' }}>
          <table className="erp-table">
            <thead><tr><th>Date</th><th style={{ textAlign: 'right' }}>Room</th><th style={{ textAlign: 'right' }}>Restaurant</th><th style={{ textAlign: 'right' }}>Services</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {rows.filter(r => r.total > 0).length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>No revenue data</td></tr>
                : rows.filter(r => r.total > 0).reverse().map(r => (
                  <tr key={r.date}>
                    <td style={{ fontWeight: 500 }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ textAlign: 'right' }}>{r.room > 0 ? fmt(r.room) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.restaurant > 0 ? fmt(r.restaurant) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.services > 0 ? fmt(r.services) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#C9A84C' }}>{fmt(r.total)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Occupancy Report ─────────────────────────────────────────────────────────

function OccupancyReport() {
  const [data, setData] = useState<{
    totalRooms: number; occupied: number; available: number
    adr: number; revpar: number
    weekPoints: { label: string; value: number }[]
    typeBreakdown: { type: string; total: number; occupied: number }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const from = dateRange(7)

    const [roomsRes, rtRes, weekResRes, rateRes] = await Promise.all([
      supabase.from('rooms').select('id, room_status, room_type_id'),
      supabase.from('room_type').select('id, type_name'),
      supabase.from('reservations').select('check_in, expected_check_out, room_id')
        .in('status', ['checked_in', 'checked_out'])
        .lte('check_in', todayStr).gte('expected_check_out', from),
      supabase.from('folio_charges').select('net_amount, charge_date')
        .eq('charge_type', 'room').gte('charge_date', from),
    ])
    if (roomsRes.error) { setError(roomsRes.error.message); setLoading(false); return }

    const rooms = roomsRes.data || []
    const rtMap = Object.fromEntries((rtRes.data || []).map((t: { id: string; type_name: string }) => [t.id, t.type_name]))
    const totalRooms = rooms.length || 1
    const occupied = rooms.filter((r: { room_status: string }) => r.room_status === 'occupied').length
    const available = rooms.filter((r: { room_status: string }) => r.room_status === 'available').length

    // ADR & RevPAR from room charges in last 7 days
    const roomRevenue = (rateRes.data || []).reduce((s: number, c: { net_amount: number }) => s + Number(c.net_amount), 0)
    const adr = occupied > 0 ? roomRevenue / 7 / occupied : 0
    const revpar = roomRevenue / 7 / totalRooms

    // Weekly occupancy chart
    const weekPoints = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dayStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
      const occ = (weekResRes.data || []).filter((r: { check_in: string; expected_check_out: string }) =>
        r.check_in <= dayStr && r.expected_check_out > dayStr
      ).length
      weekPoints.push({ label, value: Math.round((occ / totalRooms) * 100) })
    }

    // Room type breakdown
    const typeCounts: Record<string, { total: number; occupied: number }> = {}
    rooms.forEach((r: { room_type_id: string; room_status: string }) => {
      const name = rtMap[r.room_type_id] ?? 'Unknown'
      if (!typeCounts[name]) typeCounts[name] = { total: 0, occupied: 0 }
      typeCounts[name].total++
      if (r.room_status === 'occupied') typeCounts[name].occupied++
    })
    const typeBreakdown = Object.entries(typeCounts).map(([type, c]) => ({ type, ...c }))

    setData({ totalRooms, occupied, available, adr, revpar, weekPoints, typeBreakdown })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <PageLoader label="Loading occupancy data…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />
  if (!data) return null

  const occupancyPct = Math.round((data.occupied / data.totalRooms) * 100)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <SummaryCard label="Current Occupancy" value={`${occupancyPct}%`} sub={`${data.occupied} of ${data.totalRooms} rooms`} color="#C9A84C" bg="#FEF7E4" />
        <SummaryCard label="Available Rooms" value={data.available} sub="Ready to book" color="#10B981" bg="#D1FAE5" />
        <SummaryCard label="ADR (7-day)" value={fmt(Math.round(data.adr))} sub="Avg daily rate" color="#0D1F40" />
        <SummaryCard label="RevPAR (7-day)" value={fmt(Math.round(data.revpar))} sub="Revenue per available room" color="#8B5CF6" bg="#F3E8FF" />
      </div>

      <div className="erp-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40', marginBottom: 14 }}>7-Day Occupancy Trend</div>
        {data.weekPoints.some(p => p.value > 0) ? (
          <AreaChartSVG data={data.weekPoints} height={160} color="#C9A84C" valueLabel={v => v + '%'} />
        ) : (
          <EmptyState icon="🛏️" text="No check-ins in the last 7 days" />
        )}
      </div>

      <div className="erp-card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Occupancy by Room Type</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead><tr><th>Room Type</th><th style={{ textAlign: 'center' }}>Total Rooms</th><th style={{ textAlign: 'center' }}>Occupied</th><th style={{ textAlign: 'center' }}>Available</th><th style={{ textAlign: 'right' }}>Occupancy %</th></tr></thead>
            <tbody>
              {data.typeBreakdown.map(t => {
                const pct = Math.round((t.occupied / t.total) * 100)
                return (
                  <tr key={t.type}>
                    <td style={{ fontWeight: 600 }}>{t.type}</td>
                    <td style={{ textAlign: 'center' }}>{t.total}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', background: '#FEE2E2', color: '#991B1B', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{t.occupied}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', background: '#D1FAE5', color: '#065F46', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{t.total - t.occupied}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 80, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#EF4444' : pct > 50 ? '#C9A84C' : '#10B981', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontWeight: 700, color: '#0D1F40', minWidth: 36 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Restaurant Sales ─────────────────────────────────────────────────────────

type RestPeriod = '7d' | '30d'

function RestaurantReport() {
  const [period, setPeriod] = useState<RestPeriod>('30d')
  const [cats, setCats] = useState<{ category: string; orders: number; revenue: number }[]>([])
  const [topItems, setTopItems] = useState<{ name: string; orders: number; revenue: number }[]>([])
  const [dailyChart, setDailyChart] = useState<{ label: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: RestPeriod) => {
    setLoading(true); setError(null)
    const days = p === '7d' ? 7 : 30
    const from = dateRange(days)

    // Fetch orders in range (not cancelled)
    const { data: ordersData, error: ordErr } = await supabase
      .from('restaurant_orders')
      .select('id, grand_total, created_at, order_status')
      .neq('order_status', 'cancelled')
      .gte('created_at', from + 'T00:00:00')

    if (ordErr) { setError(ordErr.message); setLoading(false); return }

    const orderIds = (ordersData || []).map((o: { id: string }) => o.id)

    // Fetch line items for those orders, joined with restaurant_items for category
    const [lineRes, catRes] = await Promise.all([
      orderIds.length > 0
        ? supabase.from('restaurant_order_items')
            .select('order_id, item_name, unit_price, quantity, line_total, item_id')
            .in('order_id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('restaurant_items').select('id, item_name, category_id, restaurant_categories(category_name)'),
    ])

    // Build item_id → category_name map
    const itemCatMap: Record<string, string> = {}
    ;(catRes.data || []).forEach((item: { id: string; category_id: string; restaurant_categories?: { category_name?: string } | null }) => {
      itemCatMap[item.id] = (item.restaurant_categories as { category_name?: string } | null)?.category_name ?? 'Other'
    })

    const dayMap: Record<string, number> = {}
    ;(ordersData || []).forEach((o: { created_at: string; grand_total: number }) => {
      const label = new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      dayMap[label] = (dayMap[label] || 0) + Number(o.grand_total)
    })

    const catMap: Record<string, { orders: number; revenue: number }> = {}
    const itemMap: Record<string, { orders: number; revenue: number }> = {}

    ;(lineRes.data || []).forEach((li: { item_id: string; item_name: string; unit_price: number; quantity: number; line_total: number }) => {
      const cat = itemCatMap[li.item_id] ?? 'Other'
      const rev = Number(li.line_total || li.unit_price * li.quantity)
      if (!catMap[cat]) catMap[cat] = { orders: 0, revenue: 0 }
      catMap[cat].orders += Number(li.quantity)
      catMap[cat].revenue += rev
      if (!itemMap[li.item_name]) itemMap[li.item_name] = { orders: 0, revenue: 0 }
      itemMap[li.item_name].orders += Number(li.quantity)
      itemMap[li.item_name].revenue += rev
    })

    setCats(Object.entries(catMap).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue))
    setTopItems(Object.entries(itemMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.orders - a.orders).slice(0, 8))

    const chartPoints = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      chartPoints.push({ label, value: dayMap[label] || 0 })
    }
    setDailyChart(chartPoints)
    setLoading(false)
  }, [])

  useEffect(() => { load(period) }, [period])

  const totalRevenue = dailyChart.reduce((s, d) => s + d.value, 0)
  const totalItems = cats.reduce((s, c) => s + c.orders, 0)

  if (loading) return <PageLoader label="Loading restaurant data…" />
  if (error) return <ErrorBanner msg={error} onRetry={() => load(period)} />

  const COLORS = ['#0D1F40', '#C9A84C', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B']

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="erp-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Restaurant Sales</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Revenue by category & trend</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              {(['7d','30d'] as RestPeriod[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ padding: '7px 16px', border: 'none', borderRight: p === '7d' ? '1px solid #E2E8F0' : 'none', background: period === p ? '#0D1F40' : 'white', color: period === p ? 'white' : '#64748B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {p === '7d' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Total Revenue" value={fmt(totalRevenue)} color="#C9A84C" bg="#FEF7E4" />
          <SummaryCard label="Total Items Sold" value={totalItems} color="#0D1F40" />
          <SummaryCard label="Active Days" value={dailyChart.filter(d => d.value > 0).length} sub="days with sales" color="#10B981" bg="#D1FAE5" />
        </div>
        {dailyChart.some(d => d.value > 0) ? (
          <AreaChartSVG data={dailyChart} height={140} color="#C9A84C" valueLabel={v => '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
        ) : (
          <EmptyState icon="🍽️" text="No restaurant orders in this period" />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="erp-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40', marginBottom: 14 }}>Revenue by Category</div>
          {cats.length === 0
            ? <EmptyState icon="📊" text="No category data" />
            : cats.map((c, i) => (
              <div key={c.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#1E293B' }}>{c.category}</span>
                  <span style={{ fontWeight: 700, color: COLORS[i % COLORS.length] }}>{fmt(c.revenue)}</span>
                </div>
                <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{c.orders} items sold · {cats.reduce((s,x)=>s+x.revenue,0) > 0 ? Math.round(c.revenue / cats.reduce((s,x)=>s+x.revenue,0) * 100) : 0}% of total</div>
              </div>
            ))
          }
        </div>

        <div className="erp-card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Top Selling Items</div>
          </div>
          {topItems.length === 0
            ? <EmptyState icon="🍴" text="No item data" />
            : topItems.map((item, i) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{item.orders} orders</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#C9A84C', flexShrink: 0 }}>{fmt(item.revenue)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ─── Service Items Report ─────────────────────────────────────────────────────

function ServicesReport() {
  const [period, setPeriod] = useState<RestPeriod>('30d')
  const [items, setItems] = useState<{ name: string; count: number; revenue: number }[]>([])
  const [daily, setDaily] = useState<{ label: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: RestPeriod) => {
    setLoading(true); setError(null)
    const days = p === '7d' ? 7 : 30
    const from = dateRange(days)

    const { data, error } = await supabase
      .from('folio_charges')
      .select(`
        description, quantity, unit_price, net_amount, charge_date,
        folios(reservations(guests(guest_name), rooms(room_number)))
      `)
      .eq('charge_type', 'other')
      .gte('charge_date', from)
      .order('charge_date', { ascending: false })

    if (error) { setError(error.message); setLoading(false); return }

    const itemMap: Record<string, { count: number; revenue: number }> = {}
    const dayMap: Record<string, number> = {}

    ;(data || []).forEach((c: { description: string; quantity: number; net_amount: number; charge_date: string }) => {
      const name = c.description?.split(' — ')[0] ?? c.description ?? 'Unknown'
      if (!itemMap[name]) itemMap[name] = { count: 0, revenue: 0 }
      itemMap[name].count += Number(c.quantity)
      itemMap[name].revenue += Number(c.net_amount)
      const label = c.charge_date ? new Date(c.charge_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''
      if (label) dayMap[label] = (dayMap[label] || 0) + Number(c.net_amount)
    })

    const chartPoints = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      chartPoints.push({ label, value: dayMap[label] || 0 })
    }

    setItems(Object.entries(itemMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue))
    setDaily(chartPoints)
    setLoading(false)
  }, [])

  useEffect(() => { load(period) }, [period])

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
  const totalCount = items.reduce((s, i) => s + i.count, 0)
  const COLORS = ['#0D1F40', '#C9A84C', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B']

  if (loading) return <PageLoader label="Loading service data…" />
  if (error) return <ErrorBanner msg={error} onRetry={() => load(period)} />

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="erp-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Service Items Report</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Revenue from services billed to rooms</div>
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            {(['7d','30d'] as RestPeriod[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '7px 16px', border: 'none', borderRight: p === '7d' ? '1px solid #E2E8F0' : 'none', background: period === p ? '#0D1F40' : 'white', color: period === p ? 'white' : '#64748B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {p === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Total Service Revenue" value={fmt(totalRevenue)} color="#8B5CF6" bg="#F3E8FF" />
          <SummaryCard label="Total Items Billed" value={totalCount} color="#0D1F40" />
          <SummaryCard label="Unique Services" value={items.length} sub="different service types" color="#C9A84C" bg="#FEF7E4" />
        </div>
        {daily.some(d => d.value > 0) ? (
          <BarChartSVG data={daily} height={140} color="#8B5CF6" valueLabel={v => '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
        ) : (
          <EmptyState icon="🛎️" text="No service charges in this period" />
        )}
      </div>

      <div className="erp-card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>Service Performance</div>
        </div>
        {items.length === 0 ? (
          <EmptyState icon="🛎️" text="No service charges found" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead><tr><th>#</th><th>Service</th><th style={{ textAlign: 'center' }}>Times Billed</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>% of Total</th></tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.name}>
                    <td><div style={{ width: 22, height: 22, borderRadius: 6, background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700 }}>{i + 1}</div></td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#8B5CF6' }}>{fmt(item.revenue)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 5, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{totalRevenue > 0 ? Math.round(item.revenue / totalRevenue * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Restaurant Forecasting Report ───────────────────────────────────────────

type ForecastWindow = '7d' | '14d' | '30d'

interface ItemForecast {
  item_name: string
  category: string
  avg_daily: number        // avg qty sold per day (last 30d)
  total_sold: number       // last 30d total
  trend: 'up' | 'down' | 'stable'  // compare last 15d vs prior 15d
  forecast_7d: number      // projected qty next 7 days
  forecast_14d: number
  forecast_30d: number
  revenue_per_unit: number
  proj_revenue_7d: number
}

interface DayForecast {
  label: string
  projQty: number
  projRevenue: number
}

function ForecastReport() {
  const [window_, setWindow] = useState<ForecastWindow>('7d')
  const [items, setItems] = useState<ItemForecast[]>([])
  const [dayChart, setDayChart] = useState<DayForecast[]>([])
  const [totalSold, setTotalSold] = useState(0)
  const [activeDays, setActiveDays] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('all')
  const [cats, setCats] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const from30 = dateRange(30)
    const from15 = dateRange(15)

    // Fetch last 30 days of order line items with order date
    const { data: lineData, error: lineErr } = await supabase
      .from('restaurant_order_items')
      .select(`
        item_name, quantity, unit_price, line_total, item_id,
        restaurant_orders!inner(created_at, order_status)
      `)
      .neq('restaurant_orders.order_status', 'cancelled')
      .gte('restaurant_orders.created_at', from30 + 'T00:00:00')

    if (lineErr) { setError(lineErr.message); setLoading(false); return }

    // Fetch category map
    const { data: itemCatData } = await supabase
      .from('restaurant_items')
      .select('id, restaurant_categories(category_name)')

    const itemCatMap: Record<string, string> = {}
    ;(itemCatData || []).forEach((i: { id: string; restaurant_categories?: { category_name?: string } | null }) => {
      itemCatMap[i.id] = (i.restaurant_categories as { category_name?: string } | null)?.category_name ?? 'Other'
    })

    // Aggregate per item: last 30d total, last 15d vs prior 15d
    const itemMap: Record<string, {
      total: number; last15: number; prior15: number; revenue: number; category: string
      dailySales: Record<string, number>
    }> = {}

    ;(lineData || []).forEach((li: {
      item_name: string; quantity: number; unit_price: number; line_total: number; item_id: string
      restaurant_orders: { created_at: string }
    }) => {
      const name = li.item_name
      const qty = Number(li.quantity)
      const rev = Number(li.line_total || li.unit_price * qty)
      const createdAt = Array.isArray(li.restaurant_orders) ? li.restaurant_orders[0]?.created_at : (li.restaurant_orders as { created_at: string })?.created_at
      const dayStr = createdAt ? createdAt.split('T')[0] : ''
      const isLast15 = dayStr >= from15
      const cat = itemCatMap[li.item_id] ?? 'Other'

      if (!itemMap[name]) itemMap[name] = { total: 0, last15: 0, prior15: 0, revenue: 0, category: cat, dailySales: {} }
      itemMap[name].total += qty
      itemMap[name].revenue += rev
      if (isLast15) itemMap[name].last15 += qty
      else itemMap[name].prior15 += qty
      if (dayStr) itemMap[name].dailySales[dayStr] = (itemMap[name].dailySales[dayStr] || 0) + qty
    })

    // Count active days in last 30
    const activeDaySet = new Set<string>()
    ;(lineData || []).forEach((li: { restaurant_orders: { created_at: string } }) => {
      const createdAt = Array.isArray(li.restaurant_orders) ? li.restaurant_orders[0]?.created_at : (li.restaurant_orders as { created_at: string })?.created_at
      if (createdAt) activeDaySet.add(createdAt.split('T')[0])
    })
    const active = activeDaySet.size || 1

    const forecasts: ItemForecast[] = Object.entries(itemMap).map(([item_name, d]) => {
      const avg_daily = d.total / 30
      let trend: 'up' | 'down' | 'stable' = 'stable'
      if (d.prior15 > 0) {
        const change = (d.last15 - d.prior15) / d.prior15
        if (change > 0.1) trend = 'up'
        else if (change < -0.1) trend = 'down'
      } else if (d.last15 > 0) trend = 'up'
      const rev_per = d.total > 0 ? d.revenue / d.total : 0
      return {
        item_name,
        category: d.category,
        avg_daily,
        total_sold: d.total,
        trend,
        forecast_7d: Math.ceil(avg_daily * 7),
        forecast_14d: Math.ceil(avg_daily * 14),
        forecast_30d: Math.ceil(avg_daily * 30),
        revenue_per_unit: rev_per,
        proj_revenue_7d: Math.round(avg_daily * 7 * rev_per),
      }
    }).sort((a, b) => b.total_sold - a.total_sold)

    // Build per-day actual sales chart (last 14 days)
    const allDailySales: Record<string, { qty: number; rev: number }> = {}
    Object.values(itemMap).forEach(d => {
      Object.entries(d.dailySales).forEach(([day, qty]) => {
        if (!allDailySales[day]) allDailySales[day] = { qty: 0, rev: 0 }
        allDailySales[day].qty += qty
        // approx revenue
      })
    })
    const days14: DayForecast[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
      days14.push({ label, projQty: allDailySales[key]?.qty || 0, projRevenue: 0 })
    }

    const uniqueCats = ['all', ...Array.from(new Set(forecasts.map(f => f.category)))]
    setCats(uniqueCats)
    setItems(forecasts)
    setDayChart(days14)
    setTotalSold(forecasts.reduce((s, f) => s + f.total_sold, 0))
    setActiveDays(active)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <PageLoader label="Analysing sales history…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  const forecastDays = window_ === '7d' ? 7 : window_ === '14d' ? 14 : 30
  const filteredItems = catFilter === 'all' ? items : items.filter(i => i.category === catFilter)
  const projTotal = filteredItems.reduce((s, i) => s + (window_ === '7d' ? i.forecast_7d : window_ === '14d' ? i.forecast_14d : i.forecast_30d), 0)
  const projRevenue = filteredItems.reduce((s, i) => s + Math.round((window_ === '7d' ? i.forecast_7d : window_ === '14d' ? i.forecast_14d : i.forecast_30d) * i.revenue_per_unit), 0)

  const COLORS = ['#0D1F40', '#C9A84C', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B', '#06B6D4']
  const trendIcon = (t: 'up' | 'down' | 'stable') => t === 'up' ? '📈' : t === 'down' ? '📉' : '➡️'
  const trendColor = (t: 'up' | 'down' | 'stable') => t === 'up' ? '#10B981' : t === 'down' ? '#EF4444' : '#94A3B8'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <SummaryCard label="Items Sold (30d)" value={totalSold} sub="Across all menu items" color="#0D1F40" />
        <SummaryCard label="Avg Items/Day" value={Math.round(totalSold / (activeDays || 1))} sub={`Based on ${activeDays} active days`} color="#C9A84C" bg="#FEF7E4" />
        <SummaryCard label={`Forecast (${window_})`} value={projTotal} sub="Projected items to prepare" color="#10B981" bg="#D1FAE5" />
        <SummaryCard label={`Proj. Revenue (${window_})`} value={fmt(projRevenue)} sub="Based on avg selling price" color="#8B5CF6" bg="#F3E8FF" />
      </div>

      {/* Daily sales trend (last 14 days actual) */}
      <div className="erp-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Sales Volume — Last 14 Days</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Total items sold per day (historical basis for forecast)</div>
          </div>
        </div>
        {dayChart.some(d => d.projQty > 0)
          ? <BarChartSVG data={dayChart.map(d => ({ label: d.label, value: d.projQty }))} height={140} color="#C9A84C" valueLabel={v => String(v) + ' items'} />
          : <EmptyState icon="🍽️" text="No order history found in the last 14 days" />
        }
      </div>

      {/* Forecast table */}
      <div className="erp-card">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Item-Level Forecast</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>How many of each item to prepare in the selected window</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Category filter */}
            <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '6px 12px', border: 'none', borderRight: c !== cats[cats.length - 1] ? '1px solid #E2E8F0' : 'none', background: catFilter === c ? '#C9A84C' : 'white', color: catFilter === c ? 'white' : '#64748B', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {c === 'all' ? 'All Categories' : c}
                </button>
              ))}
            </div>
            {/* Window toggle */}
            <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              {(['7d','14d','30d'] as ForecastWindow[]).map(w => (
                <button key={w} onClick={() => setWindow(w)} style={{ padding: '6px 12px', border: 'none', borderRight: w !== '30d' ? '1px solid #E2E8F0' : 'none', background: window_ === w ? '#0D1F40' : 'white', color: window_ === w ? 'white' : '#64748B', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  {w === '7d' ? 'Next 7 Days' : w === '14d' ? 'Next 14 Days' : 'Next 30 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState icon="📊" text="No sales data available to forecast" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Menu Item</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'center' }}>Sold (30d)</th>
                  <th style={{ textAlign: 'center' }}>Avg/Day</th>
                  <th style={{ textAlign: 'center' }}>Trend</th>
                  <th style={{ textAlign: 'center', background: '#EFF2F8' }}>Prepare ({window_})</th>
                  <th style={{ textAlign: 'right' }}>Proj. Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, i) => {
                  const forecastQty = window_ === '7d' ? item.forecast_7d : window_ === '14d' ? item.forecast_14d : item.forecast_30d
                  const urgency = item.avg_daily > 5 ? 'high' : item.avg_daily > 2 ? 'medium' : 'low'
                  return (
                    <tr key={item.item_name}>
                      <td style={{ width: 32 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700 }}>{i + 1}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 13 }}>{item.item_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{fmt(item.revenue_per_unit)} per item</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11.5, padding: '2px 8px', background: '#F1F5F9', color: '#475569', borderRadius: 10, fontWeight: 600 }}>{item.category}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.total_sold}</td>
                      <td style={{ textAlign: 'center', color: '#64748B' }}>{item.avg_daily.toFixed(1)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 14 }} title={item.trend}>{trendIcon(item.trend)}</span>
                        <span style={{ fontSize: 10.5, color: trendColor(item.trend), fontWeight: 600, marginLeft: 3 }}>{item.trend}</span>
                      </td>
                      <td style={{ textAlign: 'center', background: '#F8FAFC' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 16, fontWeight: 800, color: urgency === 'high' ? '#EF4444' : urgency === 'medium' ? '#C9A84C' : '#10B981',
                            fontFamily: "'Playfair Display', serif",
                          }}>{forecastQty}</span>
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 8, fontWeight: 700,
                            background: urgency === 'high' ? '#FEE2E2' : urgency === 'medium' ? '#FEF7E4' : '#D1FAE5',
                            color: urgency === 'high' ? '#991B1B' : urgency === 'medium' ? '#92400E' : '#065F46',
                          }}>{urgency}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#C9A84C' }}>{fmt(Math.round(forecastQty * item.revenue_per_unit))}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0D1F40' }}>
                  <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 700, color: 'white', fontFamily: "'Playfair Display', serif" }}>Total Forecast ({window_})</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: '#C9A84C', fontSize: 16, fontFamily: "'Playfair Display', serif" }}>{projTotal}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display', serif" }}>{fmt(projRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Kitchen prep guide */}
      {filteredItems.length > 0 && (
        <div className="erp-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif", marginBottom: 4 }}>Kitchen Prep Guide — {window_}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>Priority items sorted by urgency based on daily average demand</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {filteredItems
              .filter(i => (window_ === '7d' ? i.forecast_7d : window_ === '14d' ? i.forecast_14d : i.forecast_30d) > 0)
              .sort((a, b) => b.avg_daily - a.avg_daily)
              .slice(0, 12)
              .map((item, i) => {
                const qty = window_ === '7d' ? item.forecast_7d : window_ === '14d' ? item.forecast_14d : item.forecast_30d
                const urgency = item.avg_daily > 5 ? 'high' : item.avg_daily > 2 ? 'medium' : 'low'
                const urgencyStyle = {
                  high:   { border: '#FECACA', bg: '#FFF5F5', badge: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
                  medium: { border: '#FCD34D', bg: '#FFFBEB', badge: '#FEF7E4', text: '#92400E', dot: '#C9A84C' },
                  low:    { border: '#A7F3D0', bg: '#F0FDF4', badge: '#D1FAE5', text: '#065F46', dot: '#10B981' },
                }[urgency]
                return (
                  <div key={item.item_name} style={{ border: `1.5px solid ${urgencyStyle.border}`, background: urgencyStyle.bg, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', flex: 1, marginRight: 6, lineHeight: 1.3 }}>{item.item_name}</div>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: urgencyStyle.badge, color: urgencyStyle.text, fontWeight: 700, flexShrink: 0 }}>{urgency}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: urgencyStyle.dot, fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>{qty}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>units</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {trendIcon(item.trend)} {item.avg_daily.toFixed(1)}/day avg · {item.category}
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Guest Report ────────────────────────────────────────────────────────────

interface GuestRow {
  id: string
  guest_name: string
  nationality: string | null
  state: string | null
  category: string | null
  age: number | null
  phone: string | null
  id_proof_type: string | null
  visits: number
  total_nights: number
  first_checkin: string | null
  last_checkin: string | null
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)
}

function GuestReport() {
  const [filterNationality, setFilterNationality] = useState('')
  const [filterState,       setFilterState]       = useState('')
  const [filterCategory,    setFilterCategory]    = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const [rows,          setRows]         = useState<GuestRow[]>([])
  const [nationalities, setNationalities] = useState<string[]>([])
  const [states,        setStates]       = useState<string[]>([])
  const [categories,    setCategories]   = useState<string[]>([])
  const [loading,       setLoading]      = useState(true)
  const [error,         setError]        = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)

    const [guestRes, historyRes] = await Promise.all([
      supabase.from('guests')
        .select('id, guest_name, nationality, state, category, date_of_birth, phone, id_proof_type')
        .eq('is_deleted', false).order('guest_name'),
      supabase.from('vw_guest_history').select('guest_id, total_stays'),
    ])
    if (guestRes.error) { setError(guestRes.error.message); setLoading(false); return }

    const guests = (guestRes.data || []) as {
      id: string; guest_name: string; nationality: string | null; state: string | null
      category: string | null; date_of_birth: string | null; phone: string | null
      id_proof_type: string | null
    }[]

    const histMap: Record<string, { visits: number }> = {}
    ;(historyRes.data || []).forEach((h: { guest_id: string; total_stays: number }) => {
      histMap[h.guest_id] = { visits: Number(h.total_stays) || 0 }
    })

    setNationalities([...new Set(guests.map(g => g.nationality).filter(Boolean) as string[])].sort())
    setStates([...new Set(guests.map(g => g.state).filter(Boolean) as string[])].sort())
    setCategories([...new Set(guests.map(g => g.category).filter(Boolean) as string[])].sort())

    let resQ = supabase.from('reservations')
      .select('id, guest_id, check_in, expected_check_out, actual_check_out')
      .neq('status', 'cancelled')
    if (dateFrom) resQ = resQ.gte('check_in', dateFrom)
    if (dateTo)   resQ = resQ.lte('check_in', dateTo)
    const { data: resData } = await resQ

    const resMap: Record<string, { total_nights: number; filtered_visits: number; first_checkin: string | null; last_checkin: string | null }> = {}
    ;(resData || []).forEach((r: { guest_id: string; check_in: string; expected_check_out: string; actual_check_out: string | null }) => {
      if (!resMap[r.guest_id]) resMap[r.guest_id] = { total_nights: 0, filtered_visits: 0, first_checkin: null, last_checkin: null }
      const e = resMap[r.guest_id]
      e.filtered_visits += 1
      const checkout = r.actual_check_out || r.expected_check_out
      e.total_nights += Math.max(1, Math.round((new Date(checkout).getTime() - new Date(r.check_in).getTime()) / 86400000))
      if (!e.first_checkin || r.check_in < e.first_checkin) e.first_checkin = r.check_in
      if (!e.last_checkin  || r.check_in > e.last_checkin)  e.last_checkin  = r.check_in
    })

    const hasDateFilter = !!(dateFrom || dateTo)
    const result: GuestRow[] = guests
      .filter(g => hasDateFilter ? !!resMap[g.id] : true)
      .map(g => ({
        id: g.id,
        guest_name: g.guest_name,
        nationality: g.nationality,
        state: g.state,
        category: g.category,
        age: calcAge(g.date_of_birth),
        phone: g.phone,
        id_proof_type: g.id_proof_type,
        visits: hasDateFilter ? (resMap[g.id]?.filtered_visits ?? 0) : (histMap[g.id]?.visits ?? 0),
        total_nights: resMap[g.id]?.total_nights ?? 0,
        first_checkin: resMap[g.id]?.first_checkin ?? null,
        last_checkin: resMap[g.id]?.last_checkin ?? null,
      }))

    setRows(result)
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const availableStates = filterNationality
    ? [...new Set(rows.filter(r => r.nationality === filterNationality).map(r => r.state).filter(Boolean) as string[])].sort()
    : states

  const filtered = rows.filter(r => {
    if (filterNationality && r.nationality !== filterNationality) return false
    if (filterState       && r.state       !== filterState)       return false
    if (filterCategory    && r.category    !== filterCategory)    return false
    return true
  })

  const grandGuests  = filtered.length
  const grandStays   = filtered.reduce((s, r) => s + r.visits, 0)
  const grandNights  = filtered.reduce((s, r) => s + r.total_nights, 0)

  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const resetFilters = () => { setFilterNationality(''); setFilterState(''); setFilterCategory(''); setDateFrom(''); setDateTo('') }

  const exportCSV = () => {
    const lines = [
      ['Guest Report'],
      [`Filters: ${filterNationality || 'All nationalities'} | ${filterState || 'All states'} | ${filterCategory || 'All categories'} | ${dateFrom || 'All'} to ${dateTo || 'All'}`],
      [],
      ['#', 'Guest Name', 'Nationality', 'State', 'Guest Category', 'Age', 'Phone', 'ID Proof', 'Visits', 'Nights', 'First Check-in', 'Last Check-in'],
      ...filtered.map((r, i) => [i + 1, r.guest_name, r.nationality || '', r.state || '', r.category || '', r.age ?? '', r.phone || '', r.id_proof_type || '', r.visits, r.total_nights, fmtDate(r.first_checkin), fmtDate(r.last_checkin)]),
      [],
      ['TOTAL', '', '', '', '', '', '', '', grandStays, grandNights],
    ]
    const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `guest-report-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const selStyle = { padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 7, fontSize: 12.5, color: '#1E293B', background: 'white', cursor: 'pointer', minWidth: 140 } as React.CSSProperties

  return (
    <div>
      {/* Filter bar */}
      <div className="erp-card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="erp-label">Nationality</label>
          <select style={selStyle} value={filterNationality} onChange={e => { setFilterNationality(e.target.value); setFilterState('') }}>
            <option value="">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="erp-label">State</label>
          <select style={selStyle} value={filterState} onChange={e => setFilterState(e.target.value)} disabled={availableStates.length === 0}>
            <option value="">All States</option>
            {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="erp-label">Guest Category</label>
          <select style={selStyle} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="erp-label">Check-in From</label>
          <input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12.5 }} />
        </div>
        <div>
          <label className="erp-label">Check-in To</label>
          <input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12.5 }} />
        </div>
        <button onClick={resetFilters}
          style={{ padding: '7px 12px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#64748B', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          Clear All
        </button>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          style={{ marginLeft: 'auto', padding: '7px 16px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#475569', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Guests" value={grandGuests} />
        <SummaryCard label="Total Visits" value={grandStays} />
        <SummaryCard label="Total Nights" value={grandNights} />
      </div>

      {/* Active filter chips */}
      {(filterNationality || filterState || filterCategory || dateFrom || dateTo) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {filterNationality && <span style={{ padding: '3px 10px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>🌍 {filterNationality}</span>}
          {filterState       && <span style={{ padding: '3px 10px', background: '#F0FDF4', color: '#166534', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>📍 {filterState}</span>}
          {filterCategory    && <span style={{ padding: '3px 10px', background: '#FEF3C7', color: '#92400E', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>🏷 {filterCategory}</span>}
          {(dateFrom || dateTo) && <span style={{ padding: '3px 10px', background: '#F5F3FF', color: '#5B21B6', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>📅 {dateFrom || '…'} → {dateTo || '…'}</span>}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>Loading…</div>
        : error ? <div style={{ color: '#EF4444', padding: 20 }}>{error}</div>
        : filtered.length === 0 ? <EmptyState icon="👥" text="No guests match the selected filters" />
        : (
        <div className="erp-card">
          <div style={{ padding: '13px 20px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>
              Guest List
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: 10 }}>{grandGuests} guest{grandGuests !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Guest Name</th>
                  <th>Nationality</th>
                  <th>State</th>
                  <th>Guest Category</th>
                  <th style={{ textAlign: 'center' }}>Age</th>
                  <th>Phone</th>
                  <th>ID Proof</th>
                  <th style={{ textAlign: 'center' }}>Visits</th>
                  <th style={{ textAlign: 'center' }}>Nights</th>
                  <th>First Check-in</th>
                  <th>Last Check-in</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: '#94A3B8', fontSize: 11 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0D1F40' }}>{r.guest_name}</div>
                      {r.visits > 1 && <div style={{ fontSize: 10.5, color: '#10B981', fontWeight: 600 }}>↩ {r.visits} visits</div>}
                    </td>
                    <td>{r.nationality || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td>{r.state || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td>
                      {r.category
                        ? <span style={{ padding: '2px 8px', background: '#F1F5F9', borderRadius: 4, fontSize: 11.5, fontWeight: 600, color: '#475569' }}>{r.category}</span>
                        : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#475569' }}>{r.age ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ fontSize: 12.5, color: '#475569' }}>{r.phone || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td>
                      {r.id_proof_type
                        ? <span style={{ fontSize: 10.5, padding: '2px 6px', background: '#F8F9FC', borderRadius: 3, color: '#64748B' }}>{r.id_proof_type}</span>
                        : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.visits || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', color: '#64748B' }}>{r.total_nights || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ fontSize: 12, color: '#64748B' }}>{fmtDate(r.first_checkin)}</td>
                    <td style={{ fontSize: 12, color: '#64748B' }}>{fmtDate(r.last_checkin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8F9FC', fontWeight: 800 }}>
                  <td /><td style={{ color: '#0D1F40' }}>Total</td>
                  <td /><td /><td /><td /><td /><td />
                  <td style={{ textAlign: 'center' }}>{grandStays}</td>
                  <td style={{ textAlign: 'center' }}>{grandNights}</td>
                  <td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Booking Category Report ──────────────────────────────────────────────────

interface BookingRow {
  reservation_id: string
  reservation_number: string | null
  check_in: string
  check_out: string | null
  nights: number
  booking_category: string
  guest_name: string
  phone: string | null
  age: number | null
  nationality: string | null
  state: string | null
}

function BookingCategoryReport() {
  const [filterCategory, setFilterCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [rows,     setRows]     = useState<BookingRow[]>([])
  const [bookingCats, setBookingCats] = useState<string[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [viewRow,  setViewRow]  = useState<BookingRow | null>(null)
  const [viewDocs, setViewDocs] = useState<{ file_url: string; file_name: string | null }[]>([])
  const [viewDocsLoading, setViewDocsLoading] = useState(false)
  const [fullRes, setFullRes] = useState<{ rate_per_night: number; adults: number; children: number; special_requests: string | null; status: string; guest_photo_url: string | null } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)

    const [bCatRes, resRes] = await Promise.all([
      supabase.from('guest_options').select('value').eq('type', 'booking_category').order('value'),
      (() => {
        let q = supabase.from('reservations')
          .select('id, reservation_number, check_in, expected_check_out, actual_check_out, booking_category, guest_id')
          .neq('status', 'cancelled')
          .not('booking_category', 'is', null)
        if (dateFrom) q = q.gte('check_in', dateFrom)
        if (dateTo)   q = q.lte('check_in', dateTo)
        return q
      })(),
    ])

    setBookingCats((bCatRes.data || []).map((o: { value: string }) => o.value))

    const reservations = (resRes.data || []) as {
      id: string; reservation_number: string | null; check_in: string
      expected_check_out: string; actual_check_out: string | null
      booking_category: string | null; guest_id: string
    }[]

    if (reservations.length === 0) { setRows([]); setLoading(false); return }

    const guestIds = [...new Set(reservations.map(r => r.guest_id))]
    const { data: guestData } = await supabase.from('guests')
      .select('id, guest_name, phone, date_of_birth, nationality, state')
      .in('id', guestIds)

    const gMap: Record<string, { guest_name: string; phone: string | null; age: number | null; nationality: string | null; state: string | null }> = {}
    ;(guestData || []).forEach((g: { id: string; guest_name: string; phone: string | null; date_of_birth: string | null; nationality: string | null; state: string | null }) => {
      gMap[g.id] = { guest_name: g.guest_name, phone: g.phone, age: calcAge(g.date_of_birth), nationality: g.nationality, state: g.state }
    })

    const result: BookingRow[] = reservations
      .filter(r => r.booking_category)
      .map(r => {
        const checkout = r.actual_check_out || r.expected_check_out || null
        const checkoutMs = checkout ? new Date(checkout).getTime() : null
        const checkinMs = new Date(r.check_in).getTime()
        const nights = checkoutMs ? Math.max(1, Math.round((checkoutMs - checkinMs) / 86400000)) : 0
        const g = gMap[r.guest_id] || { guest_name: 'Unknown', phone: null, age: null, nationality: null, state: null }
        return {
          reservation_id: r.id,
          reservation_number: r.reservation_number,
          check_in: r.check_in,
          check_out: checkout,
          nights,
          booking_category: r.booking_category!,
          guest_name: g.guest_name,
          phone: g.phone,
          age: g.age,
          nationality: g.nationality,
          state: g.state,
        }
      })
      .sort((a, b) => b.check_in.localeCompare(a.check_in))

    setRows(result)
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!viewRow) { setViewDocs([]); setFullRes(null); return }
    setViewDocsLoading(true)
    Promise.all([
      supabase.from('reservation_documents').select('file_url, file_name').eq('reservation_id', viewRow.reservation_id).order('created_at'),
      supabase.from('reservations').select('rate_per_night, adults, children, special_requests, status, guest_photo_url').eq('id', viewRow.reservation_id).single(),
    ]).then(([docsRes, resRes]) => {
      setViewDocs(docsRes.data || [])
      setFullRes(resRes.data || null)
      setViewDocsLoading(false)
    })
  }, [viewRow])

  const filtered = filterCategory ? rows.filter(r => r.booking_category === filterCategory) : rows
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    const dt = new Date(d.includes('T') ? d : d + 'T00:00:00')
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const exportCSV = () => {
    const lines = [
      ['Booking Category Report'],
      [`Category: ${filterCategory || 'All'} | Date: ${dateFrom || 'All'} to ${dateTo || 'All'}`],
      [],
      ['#', 'Booking ID', 'Guest Name', 'Phone', 'Age', 'Nationality', 'State', 'Booking Category', 'Check-in', 'Check-out', 'Nights'],
      ...filtered.map((r, i) => [i + 1, r.reservation_number || r.reservation_id.slice(0, 8).toUpperCase(), r.guest_name, r.phone || '', r.age ?? '', r.nationality || '', r.state || '', r.booking_category, fmtDate(r.check_in), fmtDate(r.check_out), r.nights]),
      [], ['TOTAL BOOKINGS', filtered.length, '', '', '', '', '', '', '', '', filtered.reduce((s, r) => s + r.nights, 0)],
    ]
    const csv = lines.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `booking-category-report-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const selStyle = { padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 7, fontSize: 12.5, color: '#1E293B', background: 'white', cursor: 'pointer', minWidth: 160 } as React.CSSProperties
  const grandNights = filtered.reduce((s, r) => s + r.nights, 0)

  return (
    <div>
      {/* Filters */}
      <div className="erp-card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="erp-label">Booking Category</label>
          <select style={selStyle} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {bookingCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="erp-label">Check-in From</label>
          <input type="date" className="erp-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12.5 }} />
        </div>
        <div>
          <label className="erp-label">Check-in To</label>
          <input type="date" className="erp-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12.5 }} />
        </div>
        <button onClick={() => { setFilterCategory(''); setDateFrom(''); setDateTo('') }}
          style={{ padding: '7px 12px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#64748B', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          Clear
        </button>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          style={{ marginLeft: 'auto', padding: '7px 16px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#475569', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Bookings" value={filtered.length} sub={filterCategory ? `in "${filterCategory}"` : 'all categories'} />
        <SummaryCard label="Total Nights" value={grandNights} />
        <SummaryCard label="Unique Categories" value={[...new Set(filtered.map(r => r.booking_category))].length} />
      </div>

      {/* Active filter chips */}
      {(filterCategory || dateFrom || dateTo) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {filterCategory    && <span style={{ padding: '3px 10px', background: '#FDF2F8', color: '#9D174D', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>🛏️ {filterCategory}</span>}
          {(dateFrom || dateTo) && <span style={{ padding: '3px 10px', background: '#F5F3FF', color: '#5B21B6', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>📅 {dateFrom || '…'} → {dateTo || '…'}</span>}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>Loading…</div>
        : error ? <div style={{ color: '#EF4444', padding: 20 }}>{error}</div>
        : filtered.length === 0 ? <EmptyState icon="🛏️" text="No bookings found for the selected filters" />
        : (
        <div className="erp-card">
          <div style={{ padding: '13px 20px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>
              Booking Category — Reservations
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: 10 }}>{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Booking ID</th>
                  <th>Guest Name</th>
                  <th>Mobile</th>
                  <th style={{ textAlign: 'center' }}>Age</th>
                  <th>Nationality</th>
                  <th>State</th>
                  <th>Booking Category</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th style={{ textAlign: 'center' }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.reservation_id} onDoubleClick={() => setViewRow(r)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: '#94A3B8', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                      {r.reservation_number || r.reservation_id.slice(0, 8).toUpperCase()}
                    </td>
                    <td style={{ fontWeight: 600, color: '#0D1F40' }}>{r.guest_name}</td>
                    <td style={{ fontSize: 12.5, color: '#475569' }}>{r.phone || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', color: '#64748B' }}>{r.age ?? <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{r.nationality || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td style={{ fontSize: 12.5 }}>{r.state || <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                    <td>
                      <span style={{ padding: '3px 9px', background: '#FDF2F8', borderRadius: 5, fontSize: 12, fontWeight: 600, color: '#9D174D' }}>
                        {r.booking_category}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: '#475569' }}>{fmtDate(r.check_in)}</td>
                    <td style={{ fontSize: 12.5, color: '#475569' }}>{fmtDate(r.check_out)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.nights}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8F9FC', fontWeight: 800 }}>
                  <td /><td /><td style={{ color: '#0D1F40' }}>Total</td>
                  <td /><td /><td /><td /><td /><td /><td />
                  <td style={{ textAlign: 'center' }}>{grandNights}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {viewRow && (
        <Modal title="Reservation Details" onClose={() => setViewRow(null)} maxWidth={580}>
          {(() => {
            const r = viewRow
            const sc: Record<string, { bg: string; color: string }> = {
              confirmed:   { bg: '#EFF6FF', color: '#1D4ED8' },
              checked_in:  { bg: '#D1FAE5', color: '#065F46' },
              checked_out: { bg: '#F1F5F9', color: '#475569' },
              cancelled:   { bg: '#FEE2E2', color: '#991B1B' },
              pending:     { bg: '#FEF3C7', color: '#92400E' },
            }
            const status = fullRes?.status || 'confirmed'
            const badge = sc[status] || sc.confirmed
            const rate = fullRes?.rate_per_night ?? 0
            const total = rate * r.nights
            const rows: [string, string][] = [
              ['Booking ID',      r.reservation_number || r.reservation_id.slice(0, 8).toUpperCase()],
              ['Status',          status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
              ['Phone',           r.phone || '—'],
              ['Nationality',     r.nationality || '—'],
              ['State',           r.state || '—'],
              ['Age',             r.age != null ? String(r.age) : '—'],
              ['Check-in',        fmtDate(r.check_in)],
              ['Check-out',       fmtDate(r.check_out)],
              ['Nights',          String(r.nights)],
              ['Adults',          fullRes ? String(fullRes.adults) : '—'],
              ['Children',        fullRes ? String(fullRes.children) : '—'],
              ['Booking Category', r.booking_category],
              ['Rate / Night',    rate ? `₹${rate.toLocaleString('en-IN')}` : '—'],
              ['Total Amount',    rate ? `₹${total.toLocaleString('en-IN')}` : '—'],
              ['Special Requests', fullRes?.special_requests || '—'],
            ]
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {fullRes?.guest_photo_url
                      ? <img src={fullRes.guest_photo_url} alt={r.guest_name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '2.5px solid #10B981', flexShrink: 0, cursor: 'pointer' }} onClick={() => window.open(fullRes.guest_photo_url!, '_blank')} />
                      : <div style={{ width: 64, height: 64, borderRadius: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: '2px dashed #CBD5E1', flexShrink: 0 }}>👤</div>
                    }
                    <div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#0D1F40' }}>{r.guest_name}</div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: '#FDF2F8', color: '#9D174D' }}>{r.booking_category}</span>
                    </div>
                  </div>
                  <span style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0 }}>
                    {status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 0, border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                  {rows.map(([label, value], i) => (
                    <div key={label} style={{ display: 'flex', borderBottom: i < rows.length - 1 ? '1px solid #F1F5F9' : 'none', background: i % 2 === 0 ? '#FAFBFC' : 'white' }}>
                      <div style={{ width: 145, padding: '9px 14px', fontSize: 11.5, fontWeight: 600, color: '#64748B', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                      <div style={{ padding: '9px 14px', fontSize: 13, color: '#1E293B', fontWeight: label === 'Total Amount' ? 700 : 400 }}>{value}</div>
                    </div>
                  ))}
                </div>

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
                                  ? <img src={d.file_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                                  : <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>}
                                <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name || `Document ${i + 1}`}</span>
                                <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>↗ Open</span>
                              </a>
                            )
                          })}
                        </div>
                  }
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setViewRow(null)}
                    style={{ padding: '8px 20px', border: '1.5px solid #E2E8F0', borderRadius: 7, background: 'white', color: '#64748B', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                    Close
                  </button>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}

// ─── Main Reports component ───────────────────────────────────────────────────

export default function Reports() {
  const [active, setActive] = useState<ReportId | 'guests' | 'booking_category'>('revenue')

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {REPORTS.map(r => (
          <button key={r.id} onClick={() => setActive(r.id)} style={{ padding: '8px 16px', borderRadius: 7, border: '1.5px solid', borderColor: active === r.id ? '#0D1F40' : '#E2E8F0', background: active === r.id ? '#0D1F40' : 'white', color: active === r.id ? 'white' : '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{r.icon}</span> {r.label}
          </button>
        ))}
        <button onClick={() => setActive('guests')} style={{ padding: '8px 16px', borderRadius: 7, border: '1.5px solid', borderColor: active === 'guests' ? '#10B981' : '#E2E8F0', background: active === 'guests' ? '#10B981' : 'white', color: active === 'guests' ? 'white' : '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          👥 Guest Report
        </button>
        <button onClick={() => setActive('booking_category')} style={{ padding: '8px 16px', borderRadius: 7, border: '1.5px solid', borderColor: active === 'booking_category' ? '#9D174D' : '#E2E8F0', background: active === 'booking_category' ? '#9D174D' : 'white', color: active === 'booking_category' ? 'white' : '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          🛏️ Booking Category
        </button>
      </div>

      {active === 'revenue'           && <RevenueReport />}
      {active === 'occupancy'         && <OccupancyReport />}
      {active === 'restaurant'        && <RestaurantReport />}
      {active === 'services'          && <ServicesReport />}
      {active === 'forecast'          && <ForecastReport />}
      {active === 'guests'            && <GuestReport />}
      {active === 'booking_category'  && <BookingCategoryReport />}
    </div>
  )
}
