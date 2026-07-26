import { useEffect } from 'react'
import { supabase } from './supabase'

/**
 * Subscribes to INSERT/UPDATE/DELETE on the given tables and calls `onRefresh` on any change.
 * Automatically cleans up the channel on unmount.
 */
export function useRealtime(tables: string[], onRefresh: () => void) {
  useEffect(() => {
    if (!tables.length) return
    const channel = supabase.channel(`realtime-${tables.join('-')}-${Math.random().toString(36).slice(2)}`)
    tables.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onRefresh)
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
