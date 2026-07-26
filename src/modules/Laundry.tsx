import { useState } from 'react'
import { sampleLaundryOrders, laundryItemsMaster, sampleGuests, sampleRooms, fmt, statusLabel, type LaundryOrder } from '../data'
import { Modal, StatusBadge } from '../ui'

export default function Laundry() {
  const [orders, setOrders] = useState<LaundryOrder[]>(sampleLaundryOrders)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<{ guest_name: string; room_number: string; items: { item_name: string; quantity: number; rate: number }[] }>({ guest_name: '', room_number: '', items: [] })
  const [selectedItem, setSelectedItem] = useState('')
  const [qty, setQty] = useState(1)

  const addItem = () => {
    const item = laundryItemsMaster.find(i => i.item_name === selectedItem)
    if (!item || !selectedItem) return
    setForm(p => ({ ...p, items: [...p.items, { item_name: item.item_name, quantity: qty, rate: item.rate }] }))
    setSelectedItem(''); setQty(1)
  }
  const handleSave = () => {
    const total = form.items.reduce((s, i) => s + i.quantity * i.rate, 0)
    setOrders(p => [{ id: 'LAU' + Date.now(), ...form, total, status: 'pending', created_at: new Date().toLocaleString() }, ...p])
    setShowModal(false)
    setForm({ guest_name: '', room_number: '', items: [] })
  }

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div className="erp-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Laundry Orders</div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Order</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead><tr><th>Order ID</th><th>Guest</th><th>Room</th><th>Items</th><th>Total</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{o.id}</td>
                  <td style={{ fontWeight: 500 }}>{o.guest_name}</td>
                  <td>#{o.room_number}</td>
                  <td style={{ fontSize: 12, color: '#64748B', maxWidth: 200 }}>{o.items.map(i => `${i.item_name} ×${i.quantity}`).join(', ')}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(o.total)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td style={{ fontSize: 12, color: '#64748B' }}>{o.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="New Laundry Order" onClose={() => setShowModal(false)} maxWidth={520}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label className="erp-label">Guest Name</label>
              <select className="erp-input" value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))}>
                <option value="">Select guest</option>
                {sampleGuests.map(g => <option key={g.id} value={g.guest_name}>{g.guest_name}</option>)}
              </select>
            </div>
            <div>
              <label className="erp-label">Room Number</label>
              <select className="erp-input" value={form.room_number} onChange={e => setForm(p => ({ ...p, room_number: e.target.value }))}>
                <option value="">Select room</option>
                {sampleRooms.filter(r => r.room_status === 'occupied').map(r => <option key={r.id} value={r.room_number}>Room {r.room_number}</option>)}
              </select>
            </div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0D1F40', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Items</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 8, alignItems: 'end', marginBottom: 10 }}>
              <div>
                <label className="erp-label">Item</label>
                <select className="erp-input" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                  <option value="">Select item</option>
                  {laundryItemsMaster.map(i => <option key={i.id} value={i.item_name}>{i.item_name} — ₹{i.rate}</option>)}
                </select>
              </div>
              <div>
                <label className="erp-label">Qty</label>
                <input className="erp-input" type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value))} />
              </div>
              <button className="btn-gold" onClick={addItem} style={{ padding: '9px 12px' }}>Add</button>
            </div>
            {form.items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ background: '#F8F9FC' }}>
                  {['Item', 'Qty', 'Rate', 'Amount'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Item' ? 'left' : 'right', color: '#64748B', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {form.items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px' }}>{item.item_name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>₹{item.rate}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(item.quantity * item.rate)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                    <td colSpan={3} style={{ padding: '8px 8px', fontWeight: 700, color: '#0D1F40' }}>Total</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#0D1F40' }}>{fmt(form.items.reduce((s, i) => s + i.quantity * i.rate, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={!form.guest_name || !form.room_number || form.items.length === 0}>Create Order</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
