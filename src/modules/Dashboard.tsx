import { useState, useEffect, useCallback } from 'react'
import { supabase, type DbDashboardKpis } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt } from '../data'
import { AreaChartSVG, BarChartSVG, DonutChartSVG, PageLoader, ErrorBanner } from '../ui'

const fallbackKpis: DbDashboardKpis = {
  total_rooms: 0, available_rooms: 0, occupied_rooms: 0, reserved_rooms: 0,
  rooms_in_maintenance: 0, todays_checkins: 0, todays_checkouts: 0,
  todays_revenue: 0, monthly_revenue: 0, occupancy_rate: 0,
}

type RevPeriod = '1d' | '7d' | '1m' | '6m'

interface CheckoutGuest {
  id: string
  guest_name: string
  room_number: string
  expected_check_out: string
  rate_per_night: number
  status: 'today' | 'overdue'
}

interface RevPoint { label: string; value: number }

export default function Dashboard({ onNavigate }: { onNavigate?: (m: string, resId?: string) => void }) {
  const [kpis, setKpis] = useState<DbDashboardKpis>(fallbackKpis)
  const [roomMix, setRoomMix] = useState<{ name: string; value: number; color: string }[]>([])
  const [checkoutGuests, setCheckoutGuests] = useState<CheckoutGuest[]>([])
  const [occupancyData, setOccupancyData] = useState<RevPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Revenue period state
  const [revPeriod, setRevPeriod] = useState<RevPeriod>('1m')
  const [revTotal, setRevTotal] = useState(0)
  const [revChart, setRevChart] = useState<RevPoint[]>([])
  const [revLoading, setRevLoading] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  // Compute date range for period
  const getPeriodRange = (period: RevPeriod): { from: string; groupBy: 'day' | 'week' | 'month' } => {
    const d = new Date()
    if (period === '1d') {
      return { from: todayStr, groupBy: 'day' }
    } else if (period === '7d') {
      d.setDate(d.getDate() - 6)
      return { from: d.toISOString().split('T')[0], groupBy: 'day' }
    } else if (period === '1m') {
      d.setDate(d.getDate() - 29)
      return { from: d.toISOString().split('T')[0], groupBy: 'day' }
    } else {
      d.setMonth(d.getMonth() - 5)
      d.setDate(1)
      return { from: d.toISOString().split('T')[0], groupBy: 'month' }
    }
  }

  const loadRevenue = useCallback(async (period: RevPeriod) => {
    setRevLoading(true)
    const { from, groupBy } = getPeriodRange(period)

    // Fetch folio charges in range (same source as Revenue Report — charges incurred)
    const { data, error } = await supabase
      .from('folio_charges')
      .select('net_amount, charge_date, charge_type')
      .neq('charge_type', 'discount')
      .gte('charge_date', from)
      .order('charge_date', { ascending: true })

    if (error || !data) { setRevLoading(false); return }

    const total = data.reduce((s: number, c: { net_amount: number }) => s + Number(c.net_amount), 0)
    setRevTotal(total)

    // Build chart points
    const buckets: Record<string, number> = {}
    data.forEach((c: { net_amount: number; charge_date: string }) => {
      const dt = new Date(c.charge_date + 'T00:00:00')
      let key: string
      if (groupBy === 'month') {
        key = dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      } else {
        key = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      }
      buckets[key] = (buckets[key] || 0) + Number(c.net_amount)
    })

    // Fill missing days/months so chart is continuous
    const points: RevPoint[] = []
    if (groupBy === 'day') {
      const days = period === '1d' ? 1 : period === '7d' ? 7 : 30
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        points.push({ label, value: buckets[label] || 0 })
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        d.setDate(1)
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        points.push({ label, value: buckets[label] || 0 })
      }
    }
    setRevChart(points)
    setRevLoading(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Build last-7-days range for occupancy
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

      const [roomsRes, roomTypesRes, checkoutRes, allRoomsRes, weekResRes, todayCheckinsRes, reservedRes, maintenanceRes] = await Promise.all([
        supabase.from('rooms').select('room_status, room_type_id'),
        supabase.from('room_type').select('id, type_name'),
        supabase.from('reservations').select(`
          id, rate_per_night, expected_check_out,
          guests(guest_name),
          rooms(room_number)
        `)
          .eq('status', 'checked_in')
          .lte('expected_check_out', todayStr)
          .order('expected_check_out', { ascending: true })
          .limit(20),
        supabase.from('rooms').select('id', { count: 'exact', head: true }), // allRoomsRes (unused — totalRooms from roomsRes)
        // Reservations active in last 7 days
        supabase.from('reservations')
          .select('check_in, expected_check_out')
          .in('status', ['checked_in', 'checked_out'])
          .lte('check_in', todayStr)
          .gte('expected_check_out', sevenDaysAgoStr),
        // Today's check-ins (check_in date = today, any status except cancelled)
        supabase.from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('check_in', todayStr)
          .neq('status', 'cancelled'),
        supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('room_status', 'reserved'),
        supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('room_status', 'maintenance'),
      ])

      // Compute KPIs directly from rooms table
      const allRooms = roomsRes.data || []
      const totalRooms = allRooms.length || 1
      const occupiedRooms = allRooms.filter((r: { room_status: string }) => r.room_status === 'occupied').length
      const availableRooms = allRooms.filter((r: { room_status: string }) => r.room_status === 'available').length
      setKpis({
        total_rooms: totalRooms,
        available_rooms: availableRooms,
        occupied_rooms: occupiedRooms,
        reserved_rooms: reservedRes.count ?? 0,
        rooms_in_maintenance: maintenanceRes.count ?? 0,
        todays_checkins: todayCheckinsRes.count ?? 0,
        todays_checkouts: 0,
        todays_revenue: 0,
        monthly_revenue: 0,
        occupancy_rate: Math.round((occupiedRooms / totalRooms) * 100),
      })

      if (roomsRes.data) {
        const typeColors: Record<string, string> = {
          'Standard': '#3B82F6', 'Deluxe': '#C9A84C', 'Suite': '#0D1F40',
          'Presidential Suite': '#10B981', 'Penthouse': '#8B5CF6',
        }
        const typeMap = Object.fromEntries((roomTypesRes.data || []).map((t: { id: string; type_name: string }) => [t.id, t.type_name]))
        const counts: Record<string, number> = {}
        roomsRes.data.forEach((r: { room_type_id?: string }) => {
          const name = (r.room_type_id ? typeMap[r.room_type_id] : null) ?? 'Other'
          counts[name] = (counts[name] || 0) + 1
        })
        setRoomMix(Object.entries(counts).map(([name, value]) => ({
          name, value, color: typeColors[name] ?? '#94A3B8',
        })))
      }

      if (checkoutRes.data) {
        setCheckoutGuests(checkoutRes.data.map((r: {
          id?: string
          guests?: { guest_name?: string } | null
          rooms?: { room_number?: string } | null
          rate_per_night?: number
          expected_check_out?: string
        }) => {
          const checkoutDate = r.expected_check_out ?? ''
          return {
            id: r.id ?? '',
            guest_name: r.guests?.guest_name ?? 'Unknown',
            room_number: r.rooms?.room_number ?? '—',
            rate_per_night: r.rate_per_night ?? 0,
            expected_check_out: checkoutDate,
            status: checkoutDate < todayStr ? 'overdue' : 'today',
          } as CheckoutGuest
        }))
      }
      // Compute weekly occupancy — for each of past 7 days, count how many reservations were active
      const totalRoomsForOccupancy = totalRooms
      const weekPoints: RevPoint[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dayStr = d.toISOString().split('T')[0]
        const label = d.toLocaleDateString('en-IN', { weekday: 'short' })
        const occupied = (weekResRes.data || []).filter((r: { check_in: string; expected_check_out: string }) =>
          r.check_in <= dayStr && r.expected_check_out > dayStr
        ).length
        weekPoints.push({ label, value: Math.round((occupied / totalRoomsForOccupancy) * 100) })
      }
      setOccupancyData(weekPoints)

    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['rooms', 'reservations', 'payments', 'folios', 'folio_charges'], load)
  useEffect(() => { loadRevenue(revPeriod) }, [revPeriod])

  if (loading) return <PageLoader label="Loading dashboard…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  const overdueCount = checkoutGuests.filter(g => g.status === 'overdue').length
  const todayCount = checkoutGuests.filter(g => g.status === 'today').length

  const stats = [
    { label: 'Total Rooms', value: kpis.total_rooms, accent: '#0D1F40', bg: '#EFF2F8', icon: '🏨' },
    { label: 'Available', value: kpis.available_rooms, accent: '#10B981', bg: '#D1FAE5', icon: '✅' },
    { label: 'Occupied', value: kpis.occupied_rooms, accent: '#EF4444', bg: '#FEE2E2', icon: '🔴' },
    { label: 'Reserved', value: kpis.reserved_rooms, accent: '#3B82F6', bg: '#DBEAFE', icon: '📅' },
    { label: "Today's Check-ins", value: kpis.todays_checkins, accent: '#10B981', bg: '#D1FAE5', icon: '⬇️' },
    { label: 'Due Today', value: todayCount, accent: '#C9A84C', bg: '#FEF7E4', icon: '⬆️' },
    { label: 'Overdue', value: overdueCount, accent: '#EF4444', bg: '#FEE2E2', icon: '⚠️' },
    { label: 'Occupancy Rate', value: `${Math.round(kpis.occupancy_rate || 0)}%`, accent: '#8B5CF6', bg: '#F3E8FF', icon: '📊' },
  ]

  const PERIODS: { id: RevPeriod; label: string }[] = [
    { id: '1d', label: 'Today' },
    { id: '7d', label: '7 Days' },
    { id: '1m', label: '1 Month' },
    { id: '6m', label: '6 Months' },
  ]

  const formatCheckoutDate = (dateStr: string) =>
    dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        {stats.map(stat => (
          <div key={stat.label} className="erp-card" style={{ padding: '16px 18px', borderTop: `3px solid ${stat.accent}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{stat.icon}</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Revenue Panel — full width */}
      <div className="erp-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Revenue</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              {revPeriod === '1d' ? "Today's" : revPeriod === '7d' ? 'Last 7 days' : revPeriod === '1m' ? 'Last 30 days' : 'Last 6 months'} revenue
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1.5px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setRevPeriod(p.id)} style={{
                padding: '7px 16px', border: 'none', borderRight: p.id !== '6m' ? '1px solid #E2E8F0' : 'none',
                background: revPeriod === p.id ? '#0D1F40' : 'white',
                color: revPeriod === p.id ? 'white' : '#64748B',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Big revenue number */}
        <div style={{ marginBottom: 20 }}>
          {revLoading ? (
            <div style={{ fontSize: 36, fontWeight: 800, color: '#CBD5E1', fontFamily: "'Playfair Display', serif" }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>{fmt(revTotal)}</div>
              {revTotal === 0 && <div style={{ fontSize: 13, color: '#94A3B8' }}>No payments recorded in this period</div>}
            </div>
          )}
        </div>

        {/* Chart */}
        {!revLoading && revChart.length > 0 && (
          revChart.some(p => p.value > 0) ? (
            <AreaChartSVG
              data={revChart}
              height={140}
              color="#C9A84C"
              valueLabel={v => '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v)}
            />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FC', borderRadius: 8, border: '1px dashed #E2E8F0', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 28 }}>💳</div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>No payments in this period</div>
            </div>
          )
        )}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="erp-card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Room Mix</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>By category</div>
          </div>
          {roomMix.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <DonutChartSVG data={roomMix} size={130} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {roomMix.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                    <span style={{ color: '#475569' }}>{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>No rooms yet</div>}
        </div>

        <div className="erp-card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Weekly Occupancy</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Past 7 days — rooms occupied %</div>
          </div>
          {occupancyData.some(p => p.value > 0) ? (
            <BarChartSVG data={occupancyData} height={140} color="#C9A84C" valueLabel={v => v + '%'} />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FC', borderRadius: 8, border: '1px dashed #E2E8F0', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 28 }}>🛏️</div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>No check-ins in the last 7 days</div>
            </div>
          )}
        </div>
      </div>

      {/* Pending Checkouts */}
      <div className="erp-card" style={{ padding: 20 }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Pending Checkouts</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Due today & overdue</div>
          </div>
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Refresh">🔄</button>
        </div>

        {checkoutGuests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 13 }}>No pending checkouts today</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {/* Overdue */}
            {overdueCount > 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 10.5, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                Overdue ({overdueCount})
              </div>
            )}
            {checkoutGuests.filter(g => g.status === 'overdue').map((g, i) => (
              <GuestCheckoutRow key={'o' + i} guest={g} formatDate={formatCheckoutDate} onNavigate={onNavigate} />
            ))}
            {/* Today */}
            {todayCount > 0 && (
              <div style={{ gridColumn: '1 / -1', fontSize: 10.5, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 5, marginTop: overdueCount > 0 ? 10 : 0, marginBottom: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C', display: 'inline-block' }} />
                Due Today ({todayCount})
              </div>
            )}
            {checkoutGuests.filter(g => g.status === 'today').map((g, i) => (
              <GuestCheckoutRow key={'t' + i} guest={g} formatDate={formatCheckoutDate} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GuestCheckoutRow({ guest, formatDate, onNavigate }: { guest: CheckoutGuest; formatDate: (d: string) => string; onNavigate?: (m: string, resId?: string) => void }) {
  const isOverdue = guest.status === 'overdue'
  return (
    <div onClick={() => onNavigate?.('checkout', guest.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid', borderColor: isOverdue ? '#FECACA' : '#E2E8F0', borderRadius: 10, background: isOverdue ? '#FFF5F5' : 'white', cursor: onNavigate ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }} onMouseEnter={e => { if (onNavigate) (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.10)' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: isOverdue ? '#FEE2E2' : '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOverdue ? '#EF4444' : '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        {guest.guest_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guest.guest_name}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Room {guest.room_number}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: isOverdue ? '#FEE2E2' : '#FEF7E4', color: isOverdue ? '#991B1B' : '#92400E', marginBottom: 2 }}>
          {isOverdue ? '⚠️ Overdue' : '🕐 Today'}
        </div>
        <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{formatDate(guest.expected_check_out)}</div>
      </div>
    </div>
  )
}
