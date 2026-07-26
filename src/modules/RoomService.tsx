import { useState } from 'react'
import { sampleRoomServiceOrders, roomServiceItemsMaster, sampleGuests, sampleRooms, fmt, type RoomServiceOrder, type OrderStatus } from '../data'
import { Modal, StatusBadge } from '../ui'

export default function RoomService() {
  const [orders, setOrders] = useState<RoomServiceOrder[]>(sampleRoomServiceOrders)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<{ guest_name: string; room_number: string; service_name: string; amount: number }>({ guest_name: '', room_number: '', service_name: '', amount: 0 })

  const handleSave = () => {
    setOrders(p => [{ id: 'RSO' + Date.now(), ...form, status: 'pending', created_at: new Date().toLocaleString() }, ...p])
    setShowModal(false)
    setForm({ guest_name: '', room_number: '', service_name: '', amount: 0 })
  }
  const updateStatus = (id: string, status: OrderStatus) => setOrders(p => p.map(o => o.id === id ? { ...o, status } : o))

  const categories = [...new Set(roomServiceItemsMaster.map(s => s.category))]

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Catalog */}
        <div className="erp-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Service Catalog</div>
          </div>
          <div style={{ padding: 14 }}>
            {categories.map(cat => (
              <div key={cat}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, marginTop: 12 }}>{cat}</div>
                {roomServiceItemsMaster.filter(s => s.category === cat).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F8F9FC' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{s.service_name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: s.amount > 0 ? '#C9A84C' : '#10B981' }}>{s.amount > 0 ? fmt(s.amount) : 'Free'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Orders */}
        <div className="erp-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Service Requests</div>
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ fontSize: 12, padding: '7px 12px' }}>+ New Request</button>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => (
              <div key={o.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#0D1F40' }}>{o.id}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', marginBottom: 3 }}>{o.service_name}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 7 }}>{o.guest_name} · Room {o.room_number}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1F40' }}>{o.amount > 0 ? fmt(o.amount) : 'Free'}</span>
                  {o.status === 'pending' && <button onClick={() => updateStatus(o.id, 'preparing')} style={{ fontSize: 11, padding: '4px 10px', background: '#DBEAFE', color: '#1E40AF', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Accept</button>}
                  {o.status === 'preparing' && <button onClick={() => updateStatus(o.id, 'delivered')} style={{ fontSize: 11, padding: '4px 10px', background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>Complete</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <Modal title="New Service Request" onClose={() => setShowModal(false)} maxWidth={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="erp-label">Guest</label>
              <select className="erp-input" value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))}>
                <option value="">Select guest</option>
                {sampleGuests.map(g => <option key={g.id} value={g.guest_name}>{g.guest_name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Room</label>
              <select className="erp-input" value={form.room_number} onChange={e => setForm(p => ({ ...p, room_number: e.target.value }))}>
                <option value="">Select room</option>
                {sampleRooms.filter(r => r.room_status === 'occupied').map(r => <option key={r.id} value={r.room_number}>Room {r.room_number}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Service</label>
              <select className="erp-input" value={form.service_name} onChange={e => {
                const s = roomServiceItemsMaster.find(s => s.service_name === e.target.value)
                setForm(p => ({ ...p, service_name: e.target.value, amount: s?.amount || 0 }))
              }}>
                <option value="">Select service</option>
                {roomServiceItemsMaster.map(s => <option key={s.id} value={s.service_name}>{s.service_name} {s.amount > 0 ? `— ₹${s.amount}` : '— Free'}</option>)}
              </select>
            </div>
            {form.service_name && (
              <div style={{ background: '#F8F9FC', borderRadius: 8, padding: 12, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>Charge:</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: form.amount > 0 ? '#C9A84C' : '#10B981' }}>{form.amount > 0 ? fmt(form.amount) : 'Free'}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.guest_name || !form.room_number || !form.service_name}>Submit</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
