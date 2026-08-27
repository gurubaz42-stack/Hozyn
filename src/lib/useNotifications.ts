import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'

export interface AppNotification {
  id: string
  type: 'order_delivered' | 'check_in' | 'check_out' | 'new_guest' | 'restaurant_sale'
  title: string
  body: string
  at: Date
  read: boolean
}

function playBell() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const play = (freq: number, t: number, dur: number, vol: number) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g); g.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.setValueAtTime(freq, t)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.start(t); osc.stop(t + dur)
    }
    play(880, ctx.currentTime, 0.5, 0.35)
    play(1100, ctx.currentTime + 0.18, 0.4, 0.25)
  } catch { /* silent */ }
}

const ICONS: Record<AppNotification['type'], string> = {
  order_delivered:  '🍽️',
  check_in:         '🛎️',
  check_out:        '🚪',
  new_guest:        '👤',
  restaurant_sale:  '🧾',
}

export function useNotifications(isManagement: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [muted, setMuted] = useState(() => localStorage.getItem('notif_muted') === '1')
  const mountedRef = useRef(false)

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      localStorage.setItem('notif_muted', next ? '1' : '0')
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(n => n.map(x => ({ ...x, read: true })))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  const push = useCallback((type: AppNotification['type'], title: string, body: string) => {
    const notif: AppNotification = { id: Math.random().toString(36).slice(2), type, title, body, at: new Date(), read: false }
    setNotifications(prev => [notif, ...prev].slice(0, 50))
    if (!muted) playBell()
  }, [muted])

  useEffect(() => {
    if (!isManagement) return

    const channel = supabase.channel('management-notifs')

    // Kitchen order delivered
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_orders' }, (p) => {
      if (!mountedRef.current) return
      if (p.new?.order_status === 'delivered' && p.old?.order_status !== 'delivered') {
        const num = p.new?.order_number || 'Order'
        const loc = p.new?.room_number ? `Room ${p.new.room_number}` : p.new?.table_number ? `Table ${p.new.table_number}` : ''
        push('order_delivered', 'Order Delivered', `${num}${loc ? ' — ' + loc : ''} has been delivered`)
      }
    })

    // New restaurant order (sale)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'restaurant_orders' }, (p) => {
      if (!mountedRef.current) return
      const num = p.new?.order_number || 'New order'
      const amt = p.new?.grand_total ? ` — ₹${Number(p.new.grand_total).toLocaleString('en-IN')}` : ''
      push('restaurant_sale', 'New Restaurant Order', `${num}${amt} placed`)
    })

    // Check-in / Check-out
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, async (p) => {
      if (!mountedRef.current) return
      if (p.new?.status === 'checked_in' && p.old?.status !== 'checked_in') {
        const { data } = await supabase.from('reservations').select('guests(guest_name), rooms(room_number)').eq('id', p.new.id).single()
        const guest = (data?.guests as { guest_name?: string } | null)?.guest_name || 'Guest'
        const room = (data?.rooms as { room_number?: string } | null)?.room_number || '—'
        push('check_in', 'Guest Checked In', `${guest} checked into Room ${room}`)
      }
      if (p.new?.status === 'checked_out' && p.old?.status !== 'checked_out') {
        const { data } = await supabase.from('reservations').select('guests(guest_name), rooms(room_number)').eq('id', p.new.id).single()
        const guest = (data?.guests as { guest_name?: string } | null)?.guest_name || 'Guest'
        const room = (data?.rooms as { room_number?: string } | null)?.room_number || '—'
        push('check_out', 'Guest Checked Out', `${guest} checked out from Room ${room}`)
      }
    })

    // New guest added
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guests' }, (p) => {
      if (!mountedRef.current) return
      const name = p.new?.guest_name || 'New guest'
      push('new_guest', 'New Guest Added', `${name} has been registered`)
    })

    channel.subscribe()
    const t = setTimeout(() => { mountedRef.current = true }, 2500)

    return () => { clearTimeout(t); supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagement])

  const unread = notifications.filter(n => !n.read).length

  return { notifications, unread, muted, toggleMute, markAllRead, clearAll, ICONS }
}
