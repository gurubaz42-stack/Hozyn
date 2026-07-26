// Shared types and sample data — imported by module files

export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning'
export type HousekeepingStatus = 'clean' | 'dirty' | 'in_progress' | 'inspected'
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'pending'
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'room_charge'
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

export interface Guest {
  id: string; guest_name: string; phone: string; email: string; address: string
  nationality: string; id_proof_type: string; id_number: string
  date_of_birth: string; gender: 'male' | 'female' | 'other'; remarks: string; created_at: string
}
export interface Room {
  id: string; room_number: string; floor: number; room_type: string
  capacity: number; bed_type: string; rate_per_night: number
  room_status: RoomStatus; housekeeping_status: HousekeepingStatus
}
export interface Reservation {
  id: string; guest_id: string; guest_name: string; room_id: string
  room_number: string; room_type: string; check_in: string; expected_check_out: string
  adults: number; children: number; special_requests: string
  status: ReservationStatus; created_at: string; rate_per_night: number
}
export interface RestaurantItem {
  id: string; category: string; item_name: string; price: number; is_available: boolean
}
export interface LaundryItem { id: string; item_name: string; rate: number }
export interface LaundryOrder {
  id: string; guest_name: string; room_number: string
  items: { item_name: string; quantity: number; rate: number }[]
  total: number; status: OrderStatus; created_at: string
}
export interface RoomServiceItem { id: string; service_name: string; amount: number; category: string }
export interface RoomServiceOrder {
  id: string; guest_name: string; room_number: string
  service_name: string; amount: number; status: OrderStatus; created_at: string
}
export interface Employee {
  id: string; employee_name: string; email: string; phone: string
  role: string; department: string; joining_date: string; is_active: boolean
}

export const sampleGuests: Guest[] = [
  { id: 'G001', guest_name: 'Rajesh Sharma', phone: '+91 98765 43210', email: 'rajesh.sharma@email.com', address: '42 MG Road, Mumbai', nationality: 'Indian', id_proof_type: 'Aadhaar Card', id_number: '2345 6789 0123', date_of_birth: '1985-03-15', gender: 'male', remarks: 'VIP, prefers high floor', created_at: '2024-12-01' },
  { id: 'G002', guest_name: 'Priya Patel', phone: '+91 87654 32109', email: 'priya.patel@email.com', address: '15 Park Street, Ahmedabad', nationality: 'Indian', id_proof_type: 'Passport', id_number: 'P1234567', date_of_birth: '1990-07-22', gender: 'female', remarks: 'Vegetarian meals', created_at: '2024-12-03' },
  { id: 'G003', guest_name: 'James Wilson', phone: '+1 415 555 0192', email: 'j.wilson@email.com', address: '220 Union Square, San Francisco', nationality: 'American', id_proof_type: 'Passport', id_number: 'US789456', date_of_birth: '1978-11-08', gender: 'male', remarks: 'Business traveler, early checkout', created_at: '2024-12-05' },
  { id: 'G004', guest_name: 'Ananya Krishnan', phone: '+91 76543 21098', email: 'ananya.k@email.com', address: '8 Anna Salai, Chennai', nationality: 'Indian', id_proof_type: 'PAN Card', id_number: 'ABCDE1234F', date_of_birth: '1995-05-30', gender: 'female', remarks: 'Honeymoon couple', created_at: '2024-12-06' },
  { id: 'G005', guest_name: 'Mohammed Al-Rashid', phone: '+971 50 123 4567', email: 'm.rashid@email.com', address: 'Dubai Marina, Dubai', nationality: 'Emirati', id_proof_type: 'Passport', id_number: 'AE456123', date_of_birth: '1982-09-14', gender: 'male', remarks: 'Halal food only', created_at: '2024-12-07' },
  { id: 'G006', guest_name: 'Sunita Mehta', phone: '+91 65432 10987', email: 'sunita.mehta@email.com', address: '33 Civil Lines, Jaipur', nationality: 'Indian', id_proof_type: 'Voter ID', id_number: 'VID987654', date_of_birth: '1972-01-20', gender: 'female', remarks: 'Loyalty member', created_at: '2024-12-08' },
]

export const sampleRooms: Room[] = [
  { id: 'R101', room_number: '101', floor: 1, room_type: 'Standard', capacity: 2, bed_type: 'Double', rate_per_night: 3500, room_status: 'available', housekeeping_status: 'clean' },
  { id: 'R102', room_number: '102', floor: 1, room_type: 'Standard', capacity: 2, bed_type: 'Twin', rate_per_night: 3500, room_status: 'occupied', housekeeping_status: 'dirty' },
  { id: 'R103', room_number: '103', floor: 1, room_type: 'Deluxe', capacity: 2, bed_type: 'King', rate_per_night: 5500, room_status: 'reserved', housekeeping_status: 'clean' },
  { id: 'R201', room_number: '201', floor: 2, room_type: 'Deluxe', capacity: 2, bed_type: 'Queen', rate_per_night: 5500, room_status: 'available', housekeeping_status: 'inspected' },
  { id: 'R202', room_number: '202', floor: 2, room_type: 'Suite', capacity: 3, bed_type: 'King', rate_per_night: 9500, room_status: 'occupied', housekeeping_status: 'dirty' },
  { id: 'R203', room_number: '203', floor: 2, room_type: 'Suite', capacity: 3, bed_type: 'King', rate_per_night: 9500, room_status: 'available', housekeeping_status: 'clean' },
  { id: 'R301', room_number: '301', floor: 3, room_type: 'Presidential Suite', capacity: 4, bed_type: 'King', rate_per_night: 18000, room_status: 'maintenance', housekeeping_status: 'dirty' },
  { id: 'R302', room_number: '302', floor: 3, room_type: 'Presidential Suite', capacity: 4, bed_type: 'King', rate_per_night: 18000, room_status: 'occupied', housekeeping_status: 'clean' },
  { id: 'R401', room_number: '401', floor: 4, room_type: 'Standard', capacity: 2, bed_type: 'Double', rate_per_night: 3500, room_status: 'cleaning', housekeeping_status: 'in_progress' },
  { id: 'R402', room_number: '402', floor: 4, room_type: 'Deluxe', capacity: 2, bed_type: 'Queen', rate_per_night: 5500, room_status: 'available', housekeeping_status: 'clean' },
  { id: 'R403', room_number: '403', floor: 4, room_type: 'Suite', capacity: 3, bed_type: 'King', rate_per_night: 9500, room_status: 'reserved', housekeeping_status: 'clean' },
  { id: 'R501', room_number: '501', floor: 5, room_type: 'Penthouse', capacity: 6, bed_type: 'King', rate_per_night: 32000, room_status: 'available', housekeeping_status: 'inspected' },
]

export const sampleReservations: Reservation[] = [
  { id: 'RES001', guest_id: 'G001', guest_name: 'Rajesh Sharma', room_id: 'R102', room_number: '102', room_type: 'Standard', check_in: '2025-01-21', expected_check_out: '2025-01-24', adults: 2, children: 0, special_requests: 'High floor', status: 'checked_in', created_at: '2025-01-15', rate_per_night: 3500 },
  { id: 'RES002', guest_id: 'G002', guest_name: 'Priya Patel', room_id: 'R202', room_number: '202', room_type: 'Suite', check_in: '2025-01-21', expected_check_out: '2025-01-23', adults: 2, children: 1, special_requests: 'Vegetarian meals', status: 'checked_in', created_at: '2025-01-10', rate_per_night: 9500 },
  { id: 'RES003', guest_id: 'G003', guest_name: 'James Wilson', room_id: 'R302', room_number: '302', room_type: 'Presidential Suite', check_in: '2025-01-21', expected_check_out: '2025-01-22', adults: 1, children: 0, special_requests: 'Early checkout 8 AM', status: 'checked_in', created_at: '2025-01-18', rate_per_night: 18000 },
  { id: 'RES004', guest_id: 'G004', guest_name: 'Ananya Krishnan', room_id: 'R103', room_number: '103', room_type: 'Deluxe', check_in: '2025-01-22', expected_check_out: '2025-01-26', adults: 2, children: 0, special_requests: 'Honeymoon decoration', status: 'confirmed', created_at: '2025-01-19', rate_per_night: 5500 },
  { id: 'RES005', guest_id: 'G005', guest_name: 'Mohammed Al-Rashid', room_id: 'R403', room_number: '403', room_type: 'Suite', check_in: '2025-01-23', expected_check_out: '2025-01-28', adults: 2, children: 2, special_requests: 'Halal food, prayer mat', status: 'confirmed', created_at: '2025-01-20', rate_per_night: 9500 },
  { id: 'RES006', guest_id: 'G006', guest_name: 'Sunita Mehta', room_id: 'R201', room_number: '201', room_type: 'Deluxe', check_in: '2025-01-20', expected_check_out: '2025-01-21', adults: 1, children: 0, special_requests: '', status: 'checked_out', created_at: '2025-01-05', rate_per_night: 5500 },
]

export const restaurantCategories = ['Breakfast', 'Lunch', 'Dinner', 'Beverages', 'Snacks', 'Desserts', 'Bar']

export const restaurantItems: RestaurantItem[] = [
  { id: 'RI001', category: 'Breakfast', item_name: 'Continental Breakfast', price: 450, is_available: true },
  { id: 'RI002', category: 'Breakfast', item_name: 'Full English Breakfast', price: 650, is_available: true },
  { id: 'RI003', category: 'Breakfast', item_name: 'Masala Omelette', price: 280, is_available: true },
  { id: 'RI004', category: 'Breakfast', item_name: 'Fruit Platter', price: 320, is_available: true },
  { id: 'RI005', category: 'Lunch', item_name: 'Grilled Chicken', price: 750, is_available: true },
  { id: 'RI006', category: 'Lunch', item_name: 'Dal Makhani + Naan', price: 480, is_available: true },
  { id: 'RI007', category: 'Lunch', item_name: 'Caesar Salad', price: 420, is_available: true },
  { id: 'RI008', category: 'Dinner', item_name: 'Butter Chicken', price: 680, is_available: true },
  { id: 'RI009', category: 'Dinner', item_name: 'Grilled Salmon', price: 1200, is_available: true },
  { id: 'RI010', category: 'Dinner', item_name: 'Paneer Tikka Masala', price: 550, is_available: true },
  { id: 'RI011', category: 'Beverages', item_name: 'Fresh Lime Soda', price: 180, is_available: true },
  { id: 'RI012', category: 'Beverages', item_name: 'Mango Lassi', price: 220, is_available: true },
  { id: 'RI013', category: 'Beverages', item_name: 'Masala Chai', price: 120, is_available: true },
  { id: 'RI014', category: 'Snacks', item_name: 'Samosa (2 pcs)', price: 160, is_available: true },
  { id: 'RI015', category: 'Snacks', item_name: 'Nachos with Dips', price: 380, is_available: true },
  { id: 'RI016', category: 'Desserts', item_name: 'Gulab Jamun', price: 220, is_available: true },
  { id: 'RI017', category: 'Desserts', item_name: 'Chocolate Lava Cake', price: 450, is_available: true },
  { id: 'RI018', category: 'Bar', item_name: 'Kingfisher Beer', price: 350, is_available: true },
  { id: 'RI019', category: 'Bar', item_name: 'Whisky On the Rocks', price: 650, is_available: true },
]

export const laundryItemsMaster: LaundryItem[] = [
  { id: 'L001', item_name: 'Shirt', rate: 80 }, { id: 'L002', item_name: 'Trouser', rate: 100 },
  { id: 'L003', item_name: 'Suit', rate: 350 }, { id: 'L004', item_name: 'Saree', rate: 250 },
  { id: 'L005', item_name: 'Kurta', rate: 120 }, { id: 'L006', item_name: 'T-Shirt', rate: 70 },
  { id: 'L007', item_name: 'Jeans', rate: 120 }, { id: 'L008', item_name: 'Bedsheet', rate: 180 },
  { id: 'L009', item_name: 'Towel', rate: 60 }, { id: 'L010', item_name: 'Pillow Cover', rate: 50 },
]

export const sampleLaundryOrders: LaundryOrder[] = [
  { id: 'LAU001', guest_name: 'Rajesh Sharma', room_number: '102', items: [{ item_name: 'Shirt', quantity: 3, rate: 80 }, { item_name: 'Trouser', quantity: 2, rate: 100 }], total: 440, status: 'delivered', created_at: '2025-01-21 09:00' },
  { id: 'LAU002', guest_name: 'Priya Patel', room_number: '202', items: [{ item_name: 'Saree', quantity: 2, rate: 250 }, { item_name: 'Kurta', quantity: 1, rate: 120 }], total: 620, status: 'preparing', created_at: '2025-01-21 11:30' },
  { id: 'LAU003', guest_name: 'James Wilson', room_number: '302', items: [{ item_name: 'Suit', quantity: 1, rate: 350 }, { item_name: 'Shirt', quantity: 2, rate: 80 }], total: 510, status: 'pending', created_at: '2025-01-21 14:00' },
]

export const roomServiceItemsMaster: RoomServiceItem[] = [
  { id: 'RS001', service_name: 'Extra Pillow', amount: 0, category: 'Housekeeping' },
  { id: 'RS002', service_name: 'Blanket', amount: 0, category: 'Housekeeping' },
  { id: 'RS003', service_name: 'Iron & Ironing Board', amount: 150, category: 'Equipment' },
  { id: 'RS004', service_name: 'Hair Dryer', amount: 0, category: 'Equipment' },
  { id: 'RS005', service_name: 'Room Cleaning', amount: 0, category: 'Housekeeping' },
  { id: 'RS006', service_name: 'Wake Up Call', amount: 0, category: 'Service' },
  { id: 'RS007', service_name: 'Airport Transfer', amount: 1200, category: 'Transport' },
  { id: 'RS008', service_name: 'Spa Appointment', amount: 2500, category: 'Wellness' },
  { id: 'RS009', service_name: 'Doctor on Call', amount: 500, category: 'Medical' },
]

export const sampleRoomServiceOrders: RoomServiceOrder[] = [
  { id: 'RSO001', guest_name: 'Rajesh Sharma', room_number: '102', service_name: 'Iron & Ironing Board', amount: 150, status: 'delivered', created_at: '2025-01-21 08:30' },
  { id: 'RSO002', guest_name: 'Priya Patel', room_number: '202', service_name: 'Spa Appointment', amount: 2500, status: 'pending', created_at: '2025-01-21 10:00' },
  { id: 'RSO003', guest_name: 'James Wilson', room_number: '302', service_name: 'Airport Transfer', amount: 1200, status: 'preparing', created_at: '2025-01-21 13:00' },
]

export const sampleEmployees: Employee[] = [
  { id: 'EMP001', employee_name: 'Guru', email: 'gurubaz42@gmail.com', phone: '+91 98001 11111', role: 'General Manager', department: 'Management', joining_date: '2020-01-15', is_active: true },
  { id: 'EMP002', employee_name: 'Pooja Desai', email: 'pooja.desai@grandvista.com', phone: '+91 98002 22222', role: 'Front Desk Manager', department: 'Front Office', joining_date: '2021-03-01', is_active: true },
  { id: 'EMP003', employee_name: 'Arjun Singh', email: 'arjun.singh@grandvista.com', phone: '+91 98003 33333', role: 'Housekeeping Supervisor', department: 'Housekeeping', joining_date: '2021-06-15', is_active: true },
  { id: 'EMP004', employee_name: 'Meena Kumari', email: 'meena.kumari@grandvista.com', phone: '+91 98004 44444', role: 'Restaurant Manager', department: 'F&B', joining_date: '2022-02-01', is_active: true },
  { id: 'EMP005', employee_name: 'Ravi Chandran', email: 'ravi.chandran@grandvista.com', phone: '+91 98005 55555', role: 'Accountant', department: 'Finance', joining_date: '2022-08-01', is_active: true },
  { id: 'EMP006', employee_name: 'Shweta Joshi', email: 'shweta.joshi@grandvista.com', phone: '+91 98006 66666', role: 'Front Desk Executive', department: 'Front Office', joining_date: '2023-01-10', is_active: true },
  { id: 'EMP007', employee_name: 'Dinesh Kumar', email: 'dinesh.kumar@grandvista.com', phone: '+91 98007 77777', role: 'Chef', department: 'F&B', joining_date: '2023-04-01', is_active: false },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')

export const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    available: 'status-available', occupied: 'status-occupied', reserved: 'status-reserved',
    maintenance: 'status-maintenance', cleaning: 'status-cleaning',
    confirmed: 'status-confirmed', checked_in: 'status-checked-in',
    checked_out: 'status-checked-out', cancelled: 'status-cancelled', pending: 'status-pending',
    delivered: 'status-checked-in', preparing: 'status-reserved', ready: 'status-confirmed',
    clean: 'status-available', dirty: 'status-occupied', in_progress: 'status-reserved',
    inspected: 'status-confirmed',
  }
  return map[status] || ''
}

export const statusLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
