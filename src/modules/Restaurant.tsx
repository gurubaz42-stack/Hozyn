import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { fmt } from '../data'
import { Modal, Field, StatusBadge, PageLoader, ErrorBanner } from '../ui'

interface Cat { id: string; category_name: string; sort_order: number; is_active: boolean }
interface TaxConfig { id: string; tax_name: string; rate: number; is_active: boolean }
interface Item { id: string; category_id: string; item_name: string; description: string | null; price: number; is_available: boolean; tax_id: string | null }
interface Order { id: string; order_number: string; room_number: string | null; table_number: string | null; subtotal: number; grand_total: number; order_status: string; created_at: string }
interface OrderLineItem { id: string; order_id: string; item_name: string; unit_price: number; quantity: number; line_total: number }
interface OrderItem { item_id: string; item_name: string; price: number; quantity: number; taxRate: number; taxName: string }

const KITCHEN_TABS = [
  { id: 'pending',   label: 'Pending',   color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { id: 'preparing', label: 'Preparing', color: '#3B82F6', bg: '#DBEAFE', text: '#1E40AF' },
  { id: 'ready',     label: 'Ready',     color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { id: 'delivered', label: 'Delivered', color: '#94A3B8', bg: '#F1F5F9', text: '#475569' },
  { id: 'cancelled', label: 'Cancelled', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
] as const

function KitchenBoard({ orders, orderLineItems, onStatusChange, onRefresh, kitchenTab, setKitchenTab, onCancel }: {
  orders: Order[]
  orderLineItems: OrderLineItem[]
  onStatusChange: (id: string, status: string, nextTab: string) => void
  onRefresh: () => void
  kitchenTab: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  setKitchenTab: (t: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled') => void
  onCancel: (order: Order) => void
}) {
  const filtered = orders.filter(o => o.order_status === kitchenTab)

  const nextAction: Record<string, { label: string; next: string; style: React.CSSProperties }> = {
    pending:   { label: 'Start Preparing', next: 'preparing', style: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' } },
    preparing: { label: 'Mark Ready',      next: 'ready',     style: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' } },
    ready:     { label: 'Mark Delivered',  next: 'delivered', style: { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' } },
  }

  const tab = KITCHEN_TABS.find(t => t.id === kitchenTab)!

  return (
    <div>
      {/* Kitchen status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {KITCHEN_TABS.map(t => {
          const count = orders.filter(o => o.order_status === t.id).length
          const active = kitchenTab === t.id
          return (
            <button key={t.id} onClick={() => setKitchenTab(t.id as typeof kitchenTab)} style={{
              padding: '8px 18px', borderRadius: 8, border: '2px solid',
              borderColor: active ? t.color : '#E2E8F0',
              background: active ? t.bg : 'white',
              color: active ? t.text : '#64748B',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {t.label}
              <span style={{
                minWidth: 20, height: 20, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? t.color : '#E2E8F0', color: active ? 'white' : '#64748B',
                fontSize: 11, fontWeight: 800,
              }}>{count}</span>
            </button>
          )
        })}
        <button onClick={onRefresh} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: '#64748B' }}>🔄 Refresh</button>
      </div>

      {/* Order cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>{kitchenTab === 'pending' ? '⏳' : kitchenTab === 'preparing' ? '👨‍🍳' : kitchenTab === 'ready' ? '✅' : kitchenTab === 'cancelled' ? '🚫' : '📦'}</div>
          No {tab.label.toLowerCase()} orders right now
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {filtered.map(order => {
            const lines = orderLineItems.filter(li => li.order_id === order.id)
            const action = nextAction[order.order_status]
            return (
              <div key={order.id} className="erp-card" style={{ padding: 0, overflow: 'hidden', borderTop: `3px solid ${tab.color}` }}>
                {/* Card header */}
                <div style={{ padding: '12px 16px', background: tab.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: tab.text, fontFamily: "'Playfair Display', serif" }}>
                    #{order.order_number || order.id.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: tab.text, background: 'rgba(0,0,0,0.06)', padding: '2px 8px', borderRadius: 6 }}>
                    {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Location */}
                <div style={{ padding: '10px 16px 6px', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
                  {order.room_number ? `🛏 Room ${order.room_number}` : order.table_number ? `🪑 Table ${order.table_number}` : '🚶 Walk-in'}
                </div>

                {/* Items list */}
                <div style={{ padding: '0 16px 12px' }}>
                  {lines.length > 0 ? lines.map(li => (
                    <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                      <span style={{ color: '#1E293B', fontWeight: 500 }}>{li.item_name}</span>
                      <span style={{ color: '#64748B', fontWeight: 700 }}>×{li.quantity}</span>
                    </div>
                  )) : <div style={{ fontSize: 12, color: '#94A3B8', padding: '4px 0' }}>No items</div>}
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#C9A84C', fontFamily: "'Playfair Display', serif" }}>{fmt(order.grand_total ?? 0)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['pending', 'preparing'].includes(order.order_status) && (
                      <button onClick={() => onCancel(order)}
                        style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                        ✕ Cancel
                      </button>
                    )}
                    {action && (
                      <button onClick={() => {
                        setKitchenTab(action.next as typeof kitchenTab)
                        onStatusChange(order.id, action.next, action.next)
                      }}
                        style={{ ...action.style, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const catEmoji: Record<string, string> = {
  Breakfast: '🍳', Lunch: '🍽️', Dinner: '🍽️', Beverages: '🍹',
  Snacks: '🍿', Desserts: '🍰', Bar: '🍺',
}

export default function RestaurantPOS() {
  const [categories, setCategories] = useState<Cat[]>([])
  const [taxes, setTaxes] = useState<TaxConfig[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [orderLineItems, setOrderLineItems] = useState<OrderLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'order' | 'kitchen' | 'menu'>('order')
  const [kitchenTab, setKitchenTab] = useState<'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'>('pending')
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [occupiedRooms, setOccupiedRooms] = useState<{ room_number: string; guest_name: string }[]>([])

  // Order state
  const [activeCategory, setActiveCategory] = useState('')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  // orderType: 'room' = bill to checked-in guest room, 'walkin' = pay at restaurant
  const [orderType, setOrderType] = useState<'room' | 'walkin'>('room')
  const [roomNumber, setRoomNumber] = useState('')
  const [paidAtRestaurant, setPaidAtRestaurant] = useState(false) // room guest paid here instead of billing to room
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'upi'>('cash')
  const [placing, setPlacing] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)

  // Menu management state
  const [showItemModal, setShowItemModal] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [menuFilter, setMenuFilter] = useState('')
  const [itemForm, setItemForm] = useState<{ item_name: string; category_id: string; description: string; price: string; is_available: boolean; tax_id: string }>({
    item_name: '', category_id: '', description: '', price: '', is_available: true, tax_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [catRes, taxRes, itemsRes, ordersRes, lineItemsRes, occupiedRes] = await Promise.all([
      supabase.from('restaurant_categories').select('*').order('sort_order'),
      supabase.from('tax_config').select('id, tax_name, rate, is_active').eq('is_active', true).order('tax_name'),
      supabase.from('restaurant_items').select('id, category_id, item_name, description, price, is_available, tax_id').order('item_name'),
      supabase.from('restaurant_orders').select('id, order_number, room_number, table_number, subtotal, grand_total, order_status, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('restaurant_order_items').select('id, order_id, item_name, unit_price, quantity, line_total'),
      supabase.from('reservations').select('room_id, rooms(room_number), guests(guest_name)').eq('status', 'checked_in'),
    ])
    if (catRes.error) { setError(catRes.error.message); setLoading(false); return }
    const cats = (catRes.data || []) as Cat[]
    setCategories(cats)
    if (cats.length > 0 && !activeCategory) setActiveCategory(cats[0].id)
    setTaxes((taxRes.data || []) as TaxConfig[])
    setItems((itemsRes.data || []) as Item[])
    setOrders((ordersRes.data || []) as Order[])
    setOrderLineItems((lineItemsRes.data || []) as OrderLineItem[])
    setOccupiedRooms(
      ((occupiedRes.data || []) as any[]).map(r => ({
        room_number: (r.rooms as any)?.room_number ?? '',
        guest_name: (r.guests as any)?.guest_name ?? 'Unknown Guest',
      })).filter(r => r.room_number !== '')
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['restaurant_orders', 'restaurant_order_items', 'restaurant_items', 'restaurant_categories'], load)

  const getCatName = (id: string) => categories.find(c => c.id === id)?.category_name ?? '—'

  // Order logic
  const menuItems = items.filter(i => i.category_id === activeCategory && i.is_available)
  const getTaxForItem = (item: Item) => taxes.find(t => t.id === item.tax_id) ?? null
  const addItem = (item: Item) => setOrderItems(prev => {
    const tax = getTaxForItem(item)
    const ex = prev.find(o => o.item_id === item.id)
    if (ex) return prev.map(o => o.item_id === item.id ? { ...o, quantity: o.quantity + 1 } : o)
    return [...prev, { item_id: item.id, item_name: item.item_name, price: item.price, quantity: 1, taxRate: tax?.rate ?? 0, taxName: tax?.tax_name ?? '' }]
  })
  const remove = (id: string) => setOrderItems(p => p.filter(o => o.item_id !== id))
  const updateQty = (id: string, qty: number) => qty <= 0 ? remove(id) : setOrderItems(p => p.map(o => o.item_id === id ? { ...o, quantity: qty } : o))
  const subtotal = orderItems.reduce((s, o) => s + o.price * o.quantity, 0)
  const taxTotal = orderItems.reduce((s, o) => s + Math.round(o.price * o.quantity * o.taxRate / 100), 0)
  const total = subtotal + taxTotal
  // Group taxes for display
  const taxBreakdown = orderItems.reduce((acc, o) => {
    if (!o.taxRate) return acc
    const key = o.taxName || `${o.taxRate}%`
    acc[key] = (acc[key] || 0) + Math.round(o.price * o.quantity * o.taxRate / 100)
    return acc
  }, {} as Record<string, number>)

  const placeOrder = async () => {
    if (orderItems.length === 0) return
    if (orderType === 'room' && !roomNumber) { alert('Please select a checked-in guest room.'); return }
    setPlacing(true)
    const orderSubtotal = orderItems.reduce((s, o) => s + o.price * o.quantity, 0)
    const orderTax = orderItems.reduce((s, o) => s + Math.round(o.price * o.quantity * o.taxRate / 100), 0)
    const orderTotal = orderSubtotal + orderTax

    // Resolve folio_id for room orders
    let folioId: string | null = null
    if (orderType === 'room' && roomNumber) {
      const { data: roomRow } = await supabase
        .from('rooms').select('id').eq('room_number', roomNumber).maybeSingle()
      if (roomRow) {
        const { data: resData } = await supabase
          .from('reservations').select('id').eq('room_id', roomRow.id).eq('status', 'checked_in').maybeSingle()
        if (resData) {
          const { data: folioData } = await supabase
            .from('folios').select('id').eq('reservation_id', resData.id).maybeSingle()
          if (folioData) folioId = folioData.id
        }
      }
    }

    const isPaidHere = orderType === 'room' && paidAtRestaurant

    const { data: newOrder, error: err } = await supabase.from('restaurant_orders').insert({
      room_number: orderType === 'room' ? (roomNumber || null) : null,
      table_number: null,
      order_status: 'pending',
      subtotal: orderSubtotal,
      tax_amount: orderTax,
      grand_total: orderTotal,
      is_billed_to_room: orderType === 'room',
      payment_method: isPaidHere ? payMethod : (orderType === 'room' ? null : payMethod),
      folio_id: folioId,
    }).select('id').single()
    if (err) { alert('Error: ' + err.message); setPlacing(false); return }

    // Insert line items
    const lineItems = orderItems.map(({ item_id, item_name, price, quantity }) => ({
      order_id: newOrder.id, item_id, item_name, unit_price: price, quantity,
    }))
    const { error: lineErr } = await supabase.from('restaurant_order_items').insert(lineItems)
    if (lineErr) { alert('Order created but line items failed: ' + lineErr.message); setPlacing(false); return }

    // Post folio charge so it appears in checkout
    if (folioId) {
      const itemDesc = orderItems.map(o => `${o.item_name} ×${o.quantity}`).join(', ')
      await supabase.from('folio_charges').insert({
        folio_id: folioId,
        charge_type: 'restaurant',
        description: isPaidHere ? `${itemDesc} (Paid)` : itemDesc,
        quantity: 1,
        unit_price: orderSubtotal,
        tax_amount: orderTax,
        restaurant_order_id: newOrder.id,
      })
    }

    setOrderPlaced(true); setPlacing(false)
    setTimeout(() => { setOrderItems([]); setOrderPlaced(false); setRoomNumber(''); setPaidAtRestaurant(false); load() }, 2000)
  }

  const updateOrderStatus = async (orderId: string, status: string, _nextTab?: string) => {
    await supabase.from('restaurant_orders').update({ order_status: status }).eq('id', orderId)
    load()
  }

  const handleCancelOrder = async () => {
    if (!cancelOrder) return
    setCancelling(true)
    await supabase.from('restaurant_orders').update({ order_status: 'cancelled' }).eq('id', cancelOrder.id)
    setCancelling(false); setCancelOrder(null); load()
  }

  // Menu management logic
  const openAddItem = () => {
    setItemForm({ item_name: '', category_id: categories[0]?.id || '', description: '', price: '', is_available: true, tax_id: '' })
    setEditItem(null); setSaveError(null); setShowItemModal(true)
  }
  const openEditItem = (item: Item) => {
    setItemForm({ item_name: item.item_name, category_id: item.category_id, description: item.description || '', price: String(item.price), is_available: item.is_available, tax_id: item.tax_id || '' })
    setEditItem(item); setSaveError(null); setShowItemModal(true)
  }
  const handleSaveItem = async () => {
    setSaveError(null)
    if (!itemForm.item_name.trim()) { setSaveError('Item name is required.'); return }
    if (!itemForm.category_id) { setSaveError('Category is required.'); return }
    if (!itemForm.price || isNaN(Number(itemForm.price))) { setSaveError('Valid price is required.'); return }
    setSaving(true)
    const payload = {
      item_name: itemForm.item_name.trim(),
      category_id: itemForm.category_id,
      description: itemForm.description.trim() || null,
      price: Number(itemForm.price),
      is_available: itemForm.is_available,
      tax_id: itemForm.tax_id || null,
    }
    const { error: err } = editItem
      ? await supabase.from('restaurant_items').update(payload).eq('id', editItem.id)
      : await supabase.from('restaurant_items').insert(payload)
    if (err) { setSaveError(err.message); setSaving(false); return }
    setSaving(false); setShowItemModal(false); load()
  }
  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('restaurant_items').delete().eq('id', id)
    load()
  }

  const filteredMenuItems = items.filter(i =>
    i.item_name.toLowerCase().includes(menuFilter.toLowerCase()) ||
    getCatName(i.category_id).toLowerCase().includes(menuFilter.toLowerCase())
  )

  if (loading) return <PageLoader label="Loading restaurant…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['order', 'kitchen', 'menu'] as const).map(tab => {
          const pendingCount = orders.filter(o => o.order_status === 'pending').length
          const isKitchenAlert = tab === 'kitchen' && pendingCount > 0 && activeTab !== 'kitchen'
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 18px', borderRadius: 6, border: '1.5px solid',
              borderColor: isKitchenAlert ? '#F59E0B' : activeTab === tab ? '#0D1F40' : '#E2E8F0',
              background: isKitchenAlert ? '#FEF3C7' : activeTab === tab ? '#0D1F40' : 'white',
              color: isKitchenAlert ? '#92400E' : activeTab === tab ? 'white' : '#64748B',
              fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {tab === 'order' ? 'Order Entry' : tab === 'kitchen' ? (
                <>
                  Kitchen
                  {isKitchenAlert ? (
                    <span style={{ background: '#EF4444', color: 'white', borderRadius: 10, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, padding: '0 4px' }}>{pendingCount}</span>
                  ) : (
                    <span>({orders.filter(o => o.order_status !== 'delivered').length})</span>
                  )}
                </>
              ) : `Menu Items (${items.length})`}
            </button>
          )
        })}
      </div>

      {/* ORDER ENTRY */}
      {activeTab === 'order' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: activeCategory === cat.id ? '#C9A84C' : '#E2E8F0', background: activeCategory === cat.id ? '#C9A84C' : 'white', color: activeCategory === cat.id ? 'white' : '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {catEmoji[cat.category_name] ?? '🍽️'} {cat.category_name}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {menuItems.map(item => (
                <div key={item.id} className="pos-item-card" onClick={() => addItem(item)}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{catEmoji[getCatName(item.category_id)] ?? '🍽️'}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', marginBottom: 4, lineHeight: 1.3 }}>{item.item_name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C' }}>{fmt(item.price)}</div>
                </div>
              ))}
              {menuItems.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 32, color: '#94A3B8', fontSize: 13 }}>
                  No items in this category — add some in the Menu Items tab
                </div>
              )}
            </div>
          </div>

          <div className="erp-card" style={{ position: 'sticky', top: 80 }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #E2E8F0', background: '#0D1F40', borderRadius: '10px 10px 0 0' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: 'white' }}>Current Order</div>
            </div>
            <div style={{ padding: 14 }}>
              {orderItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 13 }}>Click a menu item to add</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {orderItems.map(item => (
                      <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1E293B' }}>{item.item_name}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{fmt(item.price)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <button onClick={() => updateQty(item.item_id, item.quantity - 1)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #E2E8F0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>−</button>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => updateQty(item.item_id, item.quantity + 1)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #0D1F40', background: '#0D1F40', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white' }}>+</button>
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0D1F40', minWidth: 54, textAlign: 'right' }}>{fmt(item.price * item.quantity)}</div>
                        <button onClick={() => remove(item.item_id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#475569' }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                    {Object.entries(taxBreakdown).map(([name, amt]) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#475569' }}><span>{name}</span><span>{fmt(amt)}</span></div>
                    ))}
                    {taxTotal === 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#94A3B8' }}><span>Tax</span><span>—</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#0D1F40', borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 2 }}><span>Total</span><span>{fmt(total)}</span></div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    {/* Order type toggle */}
                    <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3, marginBottom: 12 }}>
                      {(['room', 'walkin'] as const).map(t => (
                        <button key={t} onClick={() => { setOrderType(t); setRoomNumber(''); setPaidAtRestaurant(false) }}
                          style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            background: orderType === t ? (t === 'room' ? '#0D1F40' : '#C9A84C') : 'transparent',
                            color: orderType === t ? 'white' : '#64748B' }}>
                          {t === 'room' ? '🛏 Room Guest' : '🚶 Walk-in'}
                        </button>
                      ))}
                    </div>

                    {orderType === 'room' ? (
                      <div>
                        <select className="erp-input" value={roomNumber} onChange={e => setRoomNumber(e.target.value)} style={{ marginBottom: 10 }}>
                          <option value="">— Select checked-in guest —</option>
                          {occupiedRooms.map(r => (
                            <option key={r.room_number} value={r.room_number}>Room {r.room_number} — {r.guest_name}</option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, marginBottom: paidAtRestaurant ? 10 : 0, padding: '8px 10px', background: paidAtRestaurant ? '#D1FAE5' : '#F8F9FC', borderRadius: 7, border: `1.5px solid ${paidAtRestaurant ? '#6EE7B7' : '#E2E8F0'}` }}>
                          <input type="checkbox" checked={paidAtRestaurant} onChange={e => setPaidAtRestaurant(e.target.checked)} style={{ accentColor: '#10B981' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: paidAtRestaurant ? '#065F46' : '#475569' }}>Paid at Restaurant</div>
                            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Guest paid here — shows as settled in checkout</div>
                          </div>
                        </label>
                        {paidAtRestaurant && (
                          <div style={{ display: 'flex', gap: 5 }}>
                            {(['cash', 'card', 'upi'] as const).map(m => (
                              <button key={m} onClick={() => setPayMethod(m)} style={{ flex: 1, padding: '6px', border: '1.5px solid', borderColor: payMethod === m ? '#0D1F40' : '#E2E8F0', borderRadius: 6, background: payMethod === m ? '#0D1F40' : 'white', color: payMethod === m ? 'white' : '#64748B', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' }}>{m}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: '#94A3B8', padding: '10px 12px', background: '#F8F9FC', borderRadius: 7, border: '1px solid #E2E8F0' }}>
                        🚶 Walk-in order — payment collected at counter, no folio linked.
                      </div>
                    )}
                  </div>
                  {orderPlaced ? (
                    <div style={{ textAlign: 'center', padding: '11px', background: '#D1FAE5', borderRadius: 7, color: '#065F46', fontWeight: 600, fontSize: 13 }}>✓ Sent to Kitchen!</div>
                  ) : (
                    <button className="btn-gold" onClick={placeOrder} disabled={placing} style={{ width: '100%', padding: '11px', borderRadius: 7, fontSize: 14 }}>
                      {placing ? 'Placing…' : `Place Order — ${fmt(total)}`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KITCHEN STATUS */}
      {activeTab === 'kitchen' && (
        <KitchenBoard orders={orders} orderLineItems={orderLineItems} onStatusChange={updateOrderStatus} onRefresh={load} kitchenTab={kitchenTab} setKitchenTab={setKitchenTab} onCancel={setCancelOrder} />
      )}

      {/* MENU MANAGEMENT */}
      {activeTab === 'menu' && (
        <div className="erp-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Menu Items ({items.length})</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="erp-input" placeholder="Search items…" value={menuFilter} onChange={e => setMenuFilter(e.target.value)} style={{ width: 200 }} />
              <button className="btn-primary" onClick={openAddItem}>+ Add Item</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr><th>Item Name</th><th>Category</th><th>Description</th><th>Price</th><th>Tax</th><th>Available</th><th></th></tr>
              </thead>
              <tbody>
                {filteredMenuItems.length === 0
                  ? <tr key="empty"><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No items found — click "+ Add Item" to create one</td></tr>
                  : filteredMenuItems.map(item => {
                  const itemTax = taxes.find(t => t.id === item.tax_id)
                  return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500 }}>{item.item_name}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', background: '#EFF2F8', borderRadius: 4, color: '#0D1F40', fontWeight: 600 }}>
                        {catEmoji[getCatName(item.category_id)] ?? '🍽️'} {getCatName(item.category_id)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: '#64748B', maxWidth: 200 }}>{item.description || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#C9A84C' }}>{fmt(item.price)}</td>
                    <td>
                      {itemTax
                        ? <span style={{ fontSize: 11, padding: '2px 8px', background: '#FEF3C7', borderRadius: 4, color: '#92400E', fontWeight: 600 }}>{itemTax.tax_name} ({itemTax.rate}%)</span>
                        : <span style={{ fontSize: 11, color: '#94A3B8' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: item.is_available ? '#D1FAE5' : '#FEE2E2', color: item.is_available ? '#065F46' : '#991B1B' }}>
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => openEditItem(item)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                        <button onClick={() => deleteItem(item.id)} style={{ padding: '4px 9px', border: '1px solid #FECACA', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', fontSize: 12, color: '#EF4444' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ITEM MODAL */}
      {showItemModal && (
        <Modal title={editItem ? 'Edit Menu Item' : 'Add Menu Item'} onClose={() => setShowItemModal(false)} maxWidth={480}>
          <div>
            {saveError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
                ⚠️ {saveError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Item Name *">
                  <input className="erp-input" placeholder="e.g. Masala Dosa" value={itemForm.item_name} onChange={e => setItemForm(p => ({ ...p, item_name: e.target.value }))} />
                </Field>
              </div>
              <Field label="Category *">
                <select className="erp-input" value={itemForm.category_id} onChange={e => setItemForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{catEmoji[c.category_name] ?? '🍽️'} {c.category_name}</option>)}
                </select>
              </Field>
              <Field label="Price (₹) *">
                <input className="erp-input" type="number" min="0" step="0.5" placeholder="0.00" value={itemForm.price} onChange={e => setItemForm(p => ({ ...p, price: e.target.value }))} />
              </Field>
              <Field label="Tax Code">
                <select className="erp-input" value={itemForm.tax_id} onChange={e => setItemForm(p => ({ ...p, tax_id: e.target.value }))}>
                  <option value="">— No Tax —</option>
                  {taxes.map(t => <option key={t.id} value={t.id}>{t.tax_name} ({t.rate}%)</option>)}
                </select>
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Description">
                  <input className="erp-input" placeholder="Brief description (optional)" value={itemForm.description} onChange={e => setItemForm(p => ({ ...p, description: e.target.value }))} />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, color: '#475569' }}>
                  <input type="checkbox" checked={itemForm.is_available} onChange={e => setItemForm(p => ({ ...p, is_available: e.target.checked }))} style={{ accentColor: '#C9A84C', width: 15, height: 15 }} />
                  Available on menu
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setShowItemModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveItem} disabled={saving}>
                {saving ? 'Saving…' : editItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cancelOrder && (
        <div className="modal-overlay">
          <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(13,31,64,0.2)' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚫</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0D1F40', marginBottom: 6 }}>Cancel Order?</div>
            <div style={{ color: '#64748B', fontSize: 13, marginBottom: 6 }}>
              Order <strong>#{cancelOrder.order_number || cancelOrder.id.slice(0, 8)}</strong>
            </div>
            <div style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>
              {cancelOrder.room_number ? `Room ${cancelOrder.room_number}` : cancelOrder.table_number ? `Table ${cancelOrder.table_number}` : 'Walk-in'} · {fmt(cancelOrder.grand_total ?? 0)}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-ghost" onClick={() => setCancelOrder(null)}>Keep Order</button>
              <button onClick={handleCancelOrder} disabled={cancelling}
                style={{ padding: '8px 20px', background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
