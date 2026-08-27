-- =============================================================================
-- HOZYN HOTEL ERP — SUPABASE / POSTGRESQL DATABASE SCHEMA
-- Compatible with: PostgreSQL 15+ / Supabase
-- Updated: 2026-07-26
--
-- Table of contents
--   01. Extensions
--   02. Enums
--   03. Hotel Settings & Config
--   04. Employees & Roles
--   05. Guests
--   06. Rooms
--   07. Reservations
--   08. Folios & Charges
--   09. Payments
--   10. Restaurant
--   11. Hotel Services
--   12. Views
--   13. Row Level Security
--   14. Real-time Publication
--   15. Indexes
--   16. Seed Data
-- =============================================================================


-- =============================================================================
-- 01. EXTENSIONS
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";


-- =============================================================================
-- 02. ENUMS
-- =============================================================================

create type room_status_enum as enum (
    'available', 'occupied', 'reserved', 'maintenance', 'cleaning'
);

create type housekeeping_status_enum as enum (
    'clean', 'dirty', 'in_progress', 'inspected'
);

create type reservation_status_enum as enum (
    'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

create type order_status_enum as enum (
    'pending', 'preparing', 'ready', 'delivered', 'cancelled'
);

create type payment_method_enum as enum (
    'cash', 'card', 'upi', 'bank_transfer', 'cheque', 'corporate', 'room_charge'
);

create type payment_status_enum as enum (
    'pending', 'paid', 'partial', 'refunded', 'failed'
);

-- charge_type_enum covers every folio line-item category the app inserts
create type charge_type_enum as enum (
    'room',         -- nightly room charge / extension
    'restaurant',   -- F&B order billed to room
    'laundry',
    'room_service', -- hotel service posted to room
    'minibar',
    'telephone',
    'spa',
    'tax',
    'discount',
    'other'
);

create type id_proof_enum as enum (
    'aadhaar_card', 'passport', 'pan_card', 'voter_id',
    'driving_license', 'oci_card', 'other'
);

create type gender_enum as enum ('male', 'female', 'other');

create type bed_type_enum as enum ('Single', 'Double', 'Twin', 'Queen', 'King');


-- =============================================================================
-- 03. HOTEL SETTINGS & CONFIG
-- =============================================================================

-- Single-row hotel information — id must always be 'main'
create table hotel_settings (
    id              text        primary key default 'main',
    hotel_name      text        not null default 'HoZyn Hotel',
    address         text        not null default '',
    phone           text        not null default '',
    email           text        not null default '',
    website         text,
    gstin           text,
    pan             text,
    star_rating     text        not null default '3',
    check_in_time   text        not null default '12:00',
    check_out_time  text        not null default '11:00',
    currency        text        not null default 'INR',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

insert into hotel_settings (id) values ('main') on conflict (id) do nothing;

-- ─── Tax Configuration ────────────────────────────────────────────────────────

create table tax_config (
    id              uuid        primary key default uuid_generate_v4(),
    tax_name        text        not null,
    -- stored as plain percentage: 5.00 = 5%, 18.00 = 18%
    rate            numeric(6,2)  not null,
    applicable_on   text,                       -- free-text label (e.g. "Restaurant")
    is_active       boolean     not null default true,
    sort_order      smallint    not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ─── Room Types ───────────────────────────────────────────────────────────────

create table room_type (
    id                  uuid        primary key default uuid_generate_v4(),
    type_name           text        not null unique,
    base_rate           numeric(12,2) not null default 0,
    extra_adult_rate    numeric(12,2) not null default 0,
    extra_child_rate    numeric(12,2) not null default 0,
    max_occupancy       smallint    not null default 2,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);


-- =============================================================================
-- 04. EMPLOYEES & ROLES
-- =============================================================================

create table roles (
    id          uuid        primary key default uuid_generate_v4(),
    role_name   text        not null unique,
    department  text        not null default '',
    -- JSON array of module slugs, e.g. ["guests","reservations","checkout"]
    -- The special value ["all"] grants unrestricted access.
    permissions jsonb       not null default '[]',
    description text,
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table employees (
    id              uuid        primary key default uuid_generate_v4(),
    employee_name   text        not null,
    -- login_id is the username used on the login screen
    login_id        text        not null unique,
    -- password stored as bcrypt hash; the app compares plaintext against this
    password_hash   text        not null,
    role_id         uuid        references roles (id) on delete restrict,
    department      text,
    phone           text,
    email           text,
    joining_date    date,
    is_active       boolean     not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index employees_login_idx on employees (login_id);
create index employees_role_idx  on employees (role_id);
create index employees_active_idx on employees (is_active);


-- =============================================================================
-- 05. GUESTS
-- =============================================================================

create table guests (
    id                  uuid        primary key default uuid_generate_v4(),
    guest_name          text        not null,
    phone               text        not null,
    email               text,
    address             text,
    city                text,
    state               text,
    country             text,
    pincode             text,
    nationality         text,
    id_proof_type       id_proof_enum,
    id_number           text,
    date_of_birth       date,
    gender              gender_enum,
    remarks             text,
    is_loyalty_member   boolean     not null default false,
    loyalty_points      integer     not null default 0,
    -- denormalized counters updated at checkout
    total_stays         integer     not null default 0,
    total_spend         numeric(14,2) not null default 0,
    is_deleted          boolean     not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index guests_name_idx  on guests (guest_name);
create index guests_phone_idx on guests (phone);
create index guests_email_idx on guests (email);


-- =============================================================================
-- 06. ROOMS
-- =============================================================================

create table rooms (
    id                  uuid                    primary key default uuid_generate_v4(),
    room_number         text                    not null unique,
    floor               smallint                not null default 1,
    room_type_id        uuid                    references room_type (id) on delete restrict,
    capacity            smallint                not null default 2,
    -- bed_type stored as text (not enum) so the UI can add types freely
    bed_type            text                    not null default 'King',
    rate_per_night      numeric(12,2)           not null default 0,
    room_status         room_status_enum        not null default 'available',
    housekeeping_status housekeeping_status_enum not null default 'clean',
    description         text,
    is_active           boolean                 not null default true,
    created_at          timestamptz             not null default now(),
    updated_at          timestamptz             not null default now()
);

create index rooms_status_idx on rooms (room_status);
create index rooms_type_idx   on rooms (room_type_id);


-- =============================================================================
-- 07. RESERVATIONS
-- =============================================================================

create table reservations (
    id                  uuid                    primary key default uuid_generate_v4(),
    -- auto-generated on insert: RES-YYYY-NNNNN
    reservation_number  text                    unique,
    guest_id            uuid                    not null references guests (id) on delete restrict,
    room_id             uuid                    not null references rooms (id) on delete restrict,
    check_in            date                    not null,
    expected_check_out  date                    not null,
    -- set to the actual calendar date when checkout is completed
    actual_check_out    date,
    adults              smallint                not null default 1,
    children            smallint                not null default 0,
    rate_per_night      numeric(12,2)           not null,
    special_requests    text,
    status              reservation_status_enum not null default 'confirmed',
    booking_source      text,
    cancelled_at        timestamptz,
    cancellation_reason text,
    created_at          timestamptz             not null default now(),
    updated_at          timestamptz             not null default now(),

    constraint chk_checkout_after_checkin check (expected_check_out > check_in),
    constraint chk_adults_positive        check (adults >= 1)
);

create index reservations_guest_idx  on reservations (guest_id);
create index reservations_room_idx   on reservations (room_id);
create index reservations_status_idx on reservations (status);
create index reservations_dates_idx  on reservations (check_in, expected_check_out);
create index reservations_actual_co  on reservations (actual_check_out);
create index reservations_checkin_idx on reservations (check_in);

create sequence reservation_seq start 1;

create or replace function generate_reservation_number()
returns trigger language plpgsql as $$
begin
    new.reservation_number :=
        'RES-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('reservation_seq')::text, 5, '0');
    return new;
end;
$$;

create trigger trg_reservation_number
before insert on reservations
for each row when (new.reservation_number is null)
execute function generate_reservation_number();


-- =============================================================================
-- 08. FOLIOS & CHARGES
-- =============================================================================

create table folios (
    id              uuid                primary key default uuid_generate_v4(),
    reservation_id  uuid                not null unique references reservations (id) on delete cascade,
    guest_id        uuid                references guests (id) on delete set null,
    -- auto-generated on insert: INV-YYYY-NNNNN
    folio_number    text                unique,
    status          payment_status_enum not null default 'pending',
    total_charges   numeric(14,2)       not null default 0,
    total_taxes     numeric(14,2)       not null default 0,
    grand_total     numeric(14,2)       not null default 0,
    amount_paid     numeric(14,2)       not null default 0,
    notes           text,
    created_at      timestamptz         not null default now(),
    updated_at      timestamptz         not null default now()
);

create index folios_reservation_idx on folios (reservation_id);

create sequence folio_seq start 1;

create or replace function generate_folio_number()
returns trigger language plpgsql as $$
begin
    new.folio_number :=
        'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('folio_seq')::text, 5, '0');
    return new;
end;
$$;

create trigger trg_folio_number
before insert on folios
for each row when (new.folio_number is null)
execute function generate_folio_number();


-- ─── Folio Charges ────────────────────────────────────────────────────────────

create table folio_charges (
    id                  uuid            primary key default uuid_generate_v4(),
    folio_id            uuid            not null references folios (id) on delete cascade,
    charge_type         charge_type_enum not null,
    description         text            not null,
    quantity            numeric(10,2)   not null default 1,
    unit_price          numeric(12,2)   not null,
    discount_amount     numeric(12,2)   not null default 0,
    tax_amount          numeric(12,2)   not null default 0,
    -- Generated column: (quantity × unit_price) − discount_amount + tax_amount
    net_amount          numeric(12,2)   generated always as
                            ((quantity * unit_price) - discount_amount + tax_amount) stored,
    -- populated when the charge originates from a restaurant order
    restaurant_order_id uuid,           -- FK added after restaurant_orders is created (below)
    charge_date         date            not null default current_date,
    created_at          timestamptz     not null default now()
);

create index folio_charges_folio_idx      on folio_charges (folio_id);
create index folio_charges_date_idx       on folio_charges (charge_date);
create index folio_charges_type_idx       on folio_charges (charge_type);
create index folio_charges_folio_type_idx on folio_charges (folio_id, charge_type);


-- =============================================================================
-- 09. PAYMENTS
-- =============================================================================

create table payments (
    id               uuid                primary key default uuid_generate_v4(),
    folio_id         uuid                not null references folios (id) on delete restrict,
    -- auto-generated on insert: PAY-YYYY-NNNNN
    payment_number   text                unique,
    amount           numeric(14,2)       not null,
    payment_method   payment_method_enum not null default 'cash',
    payment_status   payment_status_enum not null default 'paid',
    reference_number text,
    notes            text,
    payment_date     timestamptz         not null default now(),
    created_at       timestamptz         not null default now()
);

create index payments_folio_idx on payments (folio_id);
create index payments_date_idx  on payments (payment_date);

create sequence payment_seq start 1;

create or replace function generate_payment_number()
returns trigger language plpgsql as $$
begin
    new.payment_number :=
        'PAY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('payment_seq')::text, 5, '0');
    return new;
end;
$$;

create trigger trg_payment_number
before insert on payments
for each row when (new.payment_number is null)
execute function generate_payment_number();


-- =============================================================================
-- 10. RESTAURANT
-- =============================================================================

create table restaurant_categories (
    id            uuid        primary key default uuid_generate_v4(),
    category_name text        not null unique,
    sort_order    smallint    not null default 0,
    is_active     boolean     not null default true,
    created_at    timestamptz not null default now()
);

create table restaurant_items (
    id            uuid          primary key default uuid_generate_v4(),
    category_id   uuid          not null references restaurant_categories (id) on delete restrict,
    item_name     text          not null,
    description   text,
    price         numeric(10,2) not null,
    -- tax_id links to tax_config; the app calculates per-item tax at billing time.
    -- NULL = no tax on this item.
    tax_id        uuid          references tax_config (id) on delete set null,
    is_available  boolean       not null default true,
    sort_order    smallint      not null default 0,
    created_at    timestamptz   not null default now(),
    updated_at    timestamptz   not null default now()
);

create index restaurant_items_category_idx on restaurant_items (category_id);
create index restaurant_items_tax_idx      on restaurant_items (tax_id);

create table restaurant_orders (
    id               uuid                primary key default uuid_generate_v4(),
    -- auto-generated on insert: KOT-YYYY-NNNNN
    order_number     text                not null unique,
    folio_id         uuid                references folios (id) on delete set null,
    -- room_number and table_number stored as text for flexibility
    room_number      text,
    table_number     text,
    order_status     order_status_enum   not null default 'pending',
    subtotal         numeric(12,2)       not null default 0,
    tax_amount       numeric(12,2)       not null default 0,
    grand_total      numeric(12,2)       not null default 0,
    is_billed_to_room boolean            not null default false,
    payment_method   payment_method_enum,
    payment_status   payment_status_enum not null default 'pending',
    created_at       timestamptz         not null default now(),
    updated_at       timestamptz         not null default now()
);

create index restaurant_orders_folio_idx      on restaurant_orders (folio_id);
create index restaurant_orders_status_idx     on restaurant_orders (order_status);
create index restaurant_orders_created_at_idx on restaurant_orders (created_at desc);
create index restaurant_orders_room_idx       on restaurant_orders (room_number);

create sequence restaurant_order_seq start 1;

create or replace function generate_order_number()
returns trigger language plpgsql as $$
begin
    new.order_number :=
        'KOT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('restaurant_order_seq')::text, 5, '0');
    return new;
end;
$$;

create trigger trg_order_number
before insert on restaurant_orders
for each row execute function generate_order_number();

create table restaurant_order_items (
    id          uuid          primary key default uuid_generate_v4(),
    order_id    uuid          not null references restaurant_orders (id) on delete cascade,
    -- item_id may be null if item was deleted from the menu after order was placed
    item_id     uuid          references restaurant_items (id) on delete set null,
    item_name   text          not null,   -- denormalized at order time
    unit_price  numeric(10,2) not null,
    quantity    smallint      not null default 1,
    line_total  numeric(12,2) generated always as (unit_price * quantity) stored,
    created_at  timestamptz   not null default now(),

    constraint chk_qty_positive check (quantity >= 1)
);

create index roi_order_idx on restaurant_order_items (order_id);

-- Deferred FK from folio_charges to restaurant_orders
alter table folio_charges
    add constraint fk_folio_charges_restaurant_order
        foreign key (restaurant_order_id)
        references restaurant_orders (id) on delete set null;


-- =============================================================================
-- 11. GUEST OPTIONS
-- =============================================================================
-- Configurable dropdown values for the Add/Edit Guest form.
-- type: 'nationality' | 'category' | 'state'
-- Managed in Settings → Guest Options tab.

create table guest_options (
    id           uuid        primary key default uuid_generate_v4(),
    type         text        not null check (type in ('nationality', 'category', 'state')),
    value        text        not null,
    -- For type='state': stores the parent nationality/country value this state belongs to.
    -- NULL for nationality and category rows.
    parent_value text,
    sort_order   smallint    not null default 0,
    created_at   timestamptz not null default now(),
    unique (type, value, parent_value)
);

create index guest_options_type_idx on guest_options (type);

-- Also add category and state columns to guests table
alter table guests add column if not exists category text;
alter table guests add column if not exists state     text;

-- =============================================================================
-- 12. HOTEL SERVICES
-- =============================================================================

-- Master list of ancillary services (spa, laundry, transfers, etc.)
-- Staff post charges from this table to room folios via the Services module.
create table hotel_services (
    id          uuid          primary key default uuid_generate_v4(),
    name        text          not null,
    description text,
    price       numeric(10,2) not null default 0,
    is_active   boolean       not null default true,
    created_at  timestamptz   not null default now(),
    updated_at  timestamptz   not null default now()
);


-- =============================================================================
-- 12. VIEWS
-- =============================================================================

-- Guest history — used by the Guests module for the history panel
create or replace view vw_guest_history as
select
    g.id                                                                    as guest_id,
    g.guest_name,
    g.phone,
    g.email,
    g.nationality,
    count(r.id)                                                             as total_stays,
    coalesce(sum((r.expected_check_out - r.check_in) * r.rate_per_night), 0) as total_room_revenue,
    max(r.check_in)                                                         as last_stay_date
from guests g
left join reservations r on r.guest_id = g.id
where g.is_deleted = false
group by g.id, g.guest_name, g.phone, g.email, g.nationality
order by total_stays desc;

-- Dashboard KPIs — aggregated metrics for the Dashboard cards
create or replace view vw_dashboard_kpis as
select
    (select count(*) from rooms where is_active = true)                                                          as total_rooms,
    (select count(*) from rooms where room_status = 'available' and is_active = true)                           as available_rooms,
    (select count(*) from rooms where room_status = 'occupied')                                                  as occupied_rooms,
    (select count(*) from rooms where room_status = 'reserved')                                                  as reserved_rooms,
    (select count(*) from rooms where room_status = 'maintenance')                                               as rooms_in_maintenance,
    (select count(*) from reservations where check_in = current_date and status = 'confirmed')                   as todays_checkins,
    (select count(*) from reservations where expected_check_out = current_date and status = 'checked_in')        as todays_checkouts,
    (select coalesce(sum(amount), 0) from payments where payment_date::date = current_date and payment_status = 'paid')       as todays_revenue,
    (select coalesce(sum(amount), 0) from payments where date_trunc('month', payment_date) = date_trunc('month', now()) and payment_status = 'paid') as monthly_revenue,
    round(
        (select count(*)::numeric from rooms where room_status = 'occupied')
        / nullif((select count(*)::numeric from rooms where is_active = true), 0)
        * 100, 1
    )                                                                                                             as occupancy_rate;


-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================
-- All tables use open policies (USING true / WITH CHECK true) so the Supabase
-- anon key can read and write everything. Application-layer permission checks
-- (the roles/permissions system) enforce access control at the UI level.

alter table hotel_settings         enable row level security;
alter table tax_config             enable row level security;
alter table room_type              enable row level security;
alter table roles                  enable row level security;
alter table employees              enable row level security;
alter table guests                 enable row level security;
alter table rooms                  enable row level security;
alter table reservations           enable row level security;
alter table folios                 enable row level security;
alter table folio_charges          enable row level security;
alter table payments               enable row level security;
alter table restaurant_categories  enable row level security;
alter table restaurant_items       enable row level security;
alter table restaurant_orders      enable row level security;
alter table restaurant_order_items enable row level security;
alter table guest_options          enable row level security;
alter table hotel_services         enable row level security;

do $$
declare
    t text;
    tables text[] := array[
        'hotel_settings', 'tax_config', 'room_type', 'roles', 'employees',
        'guests', 'rooms', 'reservations', 'folios', 'folio_charges', 'payments',
        'restaurant_categories', 'restaurant_items', 'restaurant_orders',
        'restaurant_order_items', 'guest_options', 'hotel_services'
    ];
begin
    foreach t in array tables loop
        execute format('drop policy if exists "%s_select" on %I', t, t);
        execute format('drop policy if exists "%s_insert" on %I', t, t);
        execute format('drop policy if exists "%s_update" on %I', t, t);
        execute format('drop policy if exists "%s_delete" on %I', t, t);
        execute format('create policy "%s_select" on %I for select using (true)',            t, t);
        execute format('create policy "%s_insert" on %I for insert with check (true)',       t, t);
        execute format('create policy "%s_update" on %I for update using (true)',            t, t);
        execute format('create policy "%s_delete" on %I for delete using (true)',            t, t);
    end loop;
end;
$$;

-- Force PostgREST to reload its schema cache
notify pgrst, 'reload schema';


-- =============================================================================
-- 14. REAL-TIME PUBLICATION
-- =============================================================================
-- Enable Postgres logical replication for all tables so the useRealtime hook
-- in the app receives live postgres_changes events across all connected users.

alter publication supabase_realtime add table hotel_settings;
alter publication supabase_realtime add table tax_config;
alter publication supabase_realtime add table room_type;
alter publication supabase_realtime add table roles;
alter publication supabase_realtime add table employees;
alter publication supabase_realtime add table guests;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table folios;
alter publication supabase_realtime add table folio_charges;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table restaurant_categories;
alter publication supabase_realtime add table restaurant_items;
alter publication supabase_realtime add table restaurant_orders;
alter publication supabase_realtime add table restaurant_order_items;
alter publication supabase_realtime add table guest_options;
alter publication supabase_realtime add table hotel_services;


-- =============================================================================
-- 15. INDEXES (supplemental)
-- =============================================================================
-- Primary indexes are defined inline above. These cover cross-table query patterns.

create index folio_charges_rest_order_idx on folio_charges (restaurant_order_id);
create index reservations_guest_status_idx on reservations (guest_id, status);


-- =============================================================================
-- 16. SEED DATA
-- =============================================================================

-- ─── Roles ───────────────────────────────────────────────────────────────────

insert into roles (role_name, department, permissions) values
    ('Admin',                'Management',   '["all"]'),
    ('Front Desk Manager',   'Front Office', '["guests","reservations","checkout","reports","invoices","services"]'),
    ('Front Desk Executive', 'Front Office', '["guests","reservations","checkout","services"]'),
    ('Housekeeping',         'Housekeeping', '["rooms"]'),
    ('Restaurant Manager',   'F&B',          '["restaurant","reports"]'),
    ('Chef',                 'F&B',          '["restaurant"]'),
    ('Accountant',           'Finance',      '["checkout","reports","invoices"]')
on conflict (role_name) do nothing;

-- ─── Tax Codes (India GST rates) ─────────────────────────────────────────────

insert into tax_config (tax_name, rate, applicable_on, is_active, sort_order) values
    ('GST 5%  — Restaurant',      5.00,  'Restaurant',            true, 1),
    ('GST 12% — Room < ₹7500',   12.00,  'Room tariff < ₹7500',  true, 2),
    ('GST 18% — Room ≥ ₹7500',   18.00,  'Room tariff ≥ ₹7500',  true, 3),
    ('GST 18% — Laundry',        18.00,  'Laundry',               true, 4),
    ('GST 18% — Services',       18.00,  'Hotel services',        true, 5)
on conflict do nothing;

-- ─── Restaurant Categories ───────────────────────────────────────────────────

insert into restaurant_categories (category_name, sort_order) values
    ('Breakfast', 1), ('Lunch', 2), ('Dinner', 3),
    ('Beverages', 4), ('Snacks', 5), ('Desserts', 6), ('Bar', 7)
on conflict (category_name) do nothing;

-- ─── Hotel Services ──────────────────────────────────────────────────────────

insert into hotel_services (name, description, price, is_active) values
    ('Extra Pillow',          'Additional pillow on request',          0,    true),
    ('Extra Blanket',         'Extra blanket on request',              0,    true),
    ('Iron & Ironing Board',  'Iron and board for pressing clothes',   150,  true),
    ('Room Cleaning',         'Extra housekeeping visit',              0,    true),
    ('Laundry',               'Per-garment laundry service',           80,   true),
    ('Airport Transfer',      'One-way airport cab service',           1200, true),
    ('Spa Appointment',       'Spa & wellness session (60 min)',        2500, true),
    ('Baby Cot',              'Baby cot with bedding',                 0,    true),
    ('Minibar Restock',       'Full minibar restock',                  500,  true)
on conflict do nothing;
