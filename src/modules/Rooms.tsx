import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt, statusLabel } from '../data'
import { Modal, Field, StatusBadge, PageLoader, ErrorBanner } from '../ui'

type RoomStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning'
type HkStatus = 'clean' | 'dirty' | 'in_progress' | 'inspected'

interface RoomType {
  id: string
  type_name: string
  base_rate: number
}

interface Room {
  id: string
  room_number: string
  floor: number
  room_type_id: string
  bed_type: string
  capacity: number
  room_status: string
  housekeeping_status: string
  rate_per_night: number
  room_types?: { type_name: string } | null
}

const BED_TYPES = ['Single', 'Double', 'Twin', 'King']

export default function RoomManagement() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [form, setForm] = useState<{
    room_number: string; floor: number; room_type_id: string; bed_type: string
    capacity: number; room_status: string; housekeeping_status: string; rate_per_night: number
  }>({ room_number: '', floor: 1, room_type_id: '', bed_type: 'King', capacity: 2, room_status: 'available', housekeeping_status: 'clean', rate_per_night: 3500 })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [roomsRes, typesRes] = await Promise.all([
      supabase.from('rooms').select('*').order('room_number'),
      supabase.from('room_type').select('id, type_name, base_rate').order('type_name'),
    ])
    if (roomsRes.error) { setError(roomsRes.error.message); setLoading(false); return }
    const types: RoomType[] = (typesRes.data || []) as RoomType[]
    setRoomTypes(types)
    // join room_types client-side — no FK constraint in schema cache
    const typeMap = Object.fromEntries(types.map(t => [t.id, t]))
    const rooms = (roomsRes.data || []).map((r: Record<string, unknown>) => ({
      ...r,
      room_types: r.room_type_id ? { type_name: typeMap[r.room_type_id as string]?.type_name ?? '—' } : null,
    }))
    setRooms(rooms as Room[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['rooms', 'room_type'], load)

  const filters = ['all', 'available', 'occupied', 'reserved', 'maintenance', 'cleaning']
  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.room_status === filter)
  const filterColors: Record<string, string> = {
    all: '#64748B', available: '#10B981', occupied: '#EF4444',
    reserved: '#3B82F6', maintenance: '#F59E0B', cleaning: '#8B5CF6',
  }

  const openEdit = (r: Room) => {
    setForm({
      room_number: r.room_number, floor: r.floor, room_type_id: r.room_type_id,
      bed_type: r.bed_type, capacity: r.capacity, room_status: r.room_status,
      housekeeping_status: r.housekeeping_status, rate_per_night: r.rate_per_night,
    })
    setEditRoom(r); setSaveError(null); setShowModal(true)
  }
  const openAdd = () => {
    const firstType = roomTypes[0]
    setForm({ room_number: '', floor: 1, room_type_id: firstType?.id || '', bed_type: 'King', capacity: 2, room_status: 'available', housekeeping_status: 'clean', rate_per_night: firstType?.base_rate || 3500 })
    setEditRoom(null); setSaveError(null); setShowModal(true)
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!form.room_number.trim()) { setSaveError('Room number is required.'); return }
    if (!form.room_type_id) { setSaveError('Room type is required.'); return }
    setSaving(true)
    const payload = {
      room_number: form.room_number.trim(),
      floor: form.floor || 1,
      room_type_id: form.room_type_id,
      bed_type: form.bed_type,
      capacity: form.capacity || 2,
      room_status: form.room_status,
      housekeeping_status: form.housekeeping_status,
      rate_per_night: form.rate_per_night || 0,
    }
    const { error: err } = editRoom
      ? await supabase.from('rooms').update(payload).eq('id', editRoom.id)
      : await supabase.from('rooms').insert(payload)
    if (err) { setSaveError(err.message); setSaving(false); return }
    setSaving(false); setShowModal(false); load()
  }

  if (loading) return <PageLoader label="Loading rooms…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: filter === s ? filterColors[s] : '#E2E8F0', background: filter === s ? filterColors[s] : 'white', color: filter === s ? 'white' : '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {s === 'all' ? `All (${rooms.length})` : `${statusLabel(s)} (${rooms.filter(r => r.room_status === s).length})`}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Room</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
        {filtered.map(room => (
          <div key={room.id} className={`room-card ${room.room_status}`} onClick={() => room.room_status !== 'occupied' ? openEdit(room) : null} style={{ cursor: room.room_status === 'occupied' ? 'not-allowed' : 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>{room.room_number}</div>
              <StatusBadge status={room.room_status} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{room.room_types?.type_name || '—'}</div>
            <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 2 }}>Floor {room.floor} · {room.bed_type}</div>
            <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 8 }}>Capacity: {room.capacity}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1F40' }}>
              {fmt(room.rate_per_night)}<span style={{ fontSize: 10, fontWeight: 400, color: '#94A3B8' }}>/night</span>
            </div>
            <div style={{ marginTop: 8 }}><StatusBadge status={room.housekeeping_status} /></div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 13 }}>
            No rooms with status "{filter}"
          </div>
        )}
      </div>

      {showModal && (
        <Modal title={editRoom ? `Edit Room ${editRoom.room_number}` : 'Add Room'} onClose={() => setShowModal(false)} maxWidth={520}>
          <div>
            {saveError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                ⚠️ {saveError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Room Number">
                <input className="erp-input" placeholder="e.g. 301" value={form.room_number} onChange={e => setForm(p => ({ ...p, room_number: e.target.value }))} />
              </Field>
              <Field label="Floor">
                <input className="erp-input" type="number" min={1} value={form.floor} onChange={e => setForm(p => ({ ...p, floor: parseInt(e.target.value) || 1 }))} />
              </Field>
              <Field label="Room Type">
                <select className="erp-input" value={form.room_type_id} onChange={e => {
                  const rt = roomTypes.find(r => r.id === e.target.value)
                  setForm(p => ({ ...p, room_type_id: e.target.value, rate_per_night: rt?.base_rate || p.rate_per_night }))
                }}>
                  <option value="">Select type</option>
                  {roomTypes.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}
                </select>
              </Field>
              <Field label="Bed Type">
                <select className="erp-input" value={form.bed_type} onChange={e => setForm(p => ({ ...p, bed_type: e.target.value }))}>
                  {BED_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Capacity">
                <input className="erp-input" type="number" min={1} value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: parseInt(e.target.value) || 1 }))} />
              </Field>
              <Field label="Rate Per Night (₹)">
                <input className="erp-input" type="number" min={0} value={form.rate_per_night} onChange={e => setForm(p => ({ ...p, rate_per_night: parseInt(e.target.value) || 0 }))} />
              </Field>
              <Field label="Room Status">
                {editRoom?.room_status === 'occupied' ? (
                  <div style={{ padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', fontWeight: 500 }}>
                    🔒 Occupied — status changes automatically on checkout
                  </div>
                ) : (
                  <select className="erp-input" value={form.room_status} onChange={e => setForm(p => ({ ...p, room_status: e.target.value as RoomStatus }))}>
                    {(['available', 'reserved', 'maintenance', 'cleaning'] as RoomStatus[]).map(s => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Housekeeping Status">
                <select className="erp-input" value={form.housekeeping_status} onChange={e => setForm(p => ({ ...p, housekeeping_status: e.target.value as HkStatus }))}>
                  {(['clean', 'dirty', 'in_progress', 'inspected'] as HkStatus[]).map(s => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editRoom ? 'Update Room' : 'Add Room'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
