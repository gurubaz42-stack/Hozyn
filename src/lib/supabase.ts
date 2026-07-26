import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

function makeClient() {
  return createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

let _client: SupabaseClient

if (import.meta.hot) {
  // Reuse the client across HMR reloads so only one GoTrueClient is created
  if (!import.meta.hot.data.supabase) {
    import.meta.hot.data.supabase = makeClient()
  }
  _client = import.meta.hot.data.supabase
} else {
  _client = makeClient()
}

export const supabase = _client

// ─── DB row types (match schema.sql column names) ─────────────────────────────

export interface DbGuest {
  guest_id: string
  guest_name: string
  phone: string | null
  email: string | null
  address: string | null
  nationality: string | null
  id_proof_type: string | null
  id_number: string | null
  date_of_birth: string | null
  gender: 'male' | 'female' | 'other' | null
  remarks: string | null
  total_stays: number
  total_spend: number
  created_at: string
}

export interface DbRoomType {
  type_id: string
  type_name: string
  base_rate: number
  extra_adult_rate: number
  extra_child_rate: number
  max_occupancy: number
}

export interface DbRoom {
  room_id: string
  room_number: string
  floor: number
  type_id: string
  bed_type: string
  capacity: number
  room_status: string
  housekeeping_status: string
  rate_per_night: number
  room_types?: { type_name: string }
}

export interface DbReservation {
  reservation_id: string
  reservation_number: string | null
  guest_id: string
  room_id: string
  check_in: string
  expected_check_out: string
  actual_check_out: string | null
  adults: number
  children: number
  special_requests: string | null
  status: string
  rate_per_night: number | null
  created_at: string
  guests?: { guest_name: string; phone: string | null }
  rooms?: { room_number: string; room_types?: { type_name: string } | null }
}

export interface DbRestaurantCategory {
  category_id: string
  category_name: string
  display_order: number
}

export interface DbRestaurantItem {
  item_id: string
  category_id: string
  item_name: string
  price: number
  is_available: boolean
  restaurant_categories?: { category_name: string }
}

export interface DbRestaurantOrder {
  order_id: string
  order_number: string | null
  reservation_id: string | null
  room_number: string | null
  table_number: string | null
  order_items: { item_name: string; price: number; quantity: number }[]
  subtotal: number | null
  gst_amount: number | null
  total_amount: number | null
  payment_method: string | null
  bill_to_room: boolean
  status: string
  created_at: string
}

export interface DbRole {
  role_id: string
  role_name: string
  department: string | null
  permissions: string[]
}

export interface DbEmployee {
  employee_id: string
  employee_number: string | null
  employee_name: string
  email: string | null
  phone: string | null
  role_id: string | null
  joining_date: string | null
  is_active: boolean
  created_at: string
  roles?: { role_name: string; department: string | null; permissions: string[] }
}

export interface DbDashboardKpis {
  total_rooms: number
  available_rooms: number
  occupied_rooms: number
  reserved_rooms: number
  rooms_in_maintenance: number
  todays_checkins: number
  todays_checkouts: number
  todays_revenue: number
  monthly_revenue: number
  occupancy_rate: number
}

export interface DbFolioSummary {
  folio_id: string
  folio_number: string | null
  reservation_id: string
  reservation_number: string | null
  guest_name: string
  phone: string | null
  email: string | null
  room_number: string
  room_type: string | null
  check_in: string
  expected_check_out: string
  nights: number
  total_charges: number
  total_discounts: number
  total_taxes: number
  grand_total: number
  amount_paid: number
  balance_due: number
  payment_status: string
}
