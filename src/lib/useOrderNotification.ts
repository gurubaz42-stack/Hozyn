import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

// Short bell tone generated via Web Audio API
function playBell() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    // Two-tone ding-dong
    playTone(880, ctx.currentTime, 0.6, 0.4)
    playTone(660, ctx.currentTime + 0.25, 0.6, 0.3)
  } catch {
    // Audio not available — silent fail
  }
}

export function useOrderNotification(hasRestaurantAccess: boolean) {
  const lastOrderIdRef = useRef<string | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!hasRestaurantAccess) return

    const channel = supabase.channel('order-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'restaurant_orders' }, (payload) => {
        // Skip the very first event after mount to avoid notifying on page load
        if (!mountedRef.current) return
        const newId = payload.new?.id
        if (newId && newId !== lastOrderIdRef.current) {
          lastOrderIdRef.current = newId
          playBell()
          showToast(payload.new?.order_number || 'New Order')
        }
      })
      .subscribe()

    // Mark as mounted after a short delay so initial load events are ignored
    const t = setTimeout(() => { mountedRef.current = true }, 2000)

    return () => {
      clearTimeout(t)
      supabase.removeChannel(channel)
    }
  }, [hasRestaurantAccess])
}

function showToast(orderNumber: string) {
  const toast = document.createElement('div')
  toast.textContent = `🔔 New Order — ${orderNumber}`
  Object.assign(toast.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: '99999',
    background: '#0D1F40', color: 'white', padding: '12px 20px',
    borderRadius: '10px', fontFamily: 'sans-serif', fontSize: '14px',
    fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    border: '2px solid #C9A84C', transition: 'opacity 0.4s',
    display: 'flex', alignItems: 'center', gap: '8px',
  })
  document.body.appendChild(toast)
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400) }, 4000)
}
