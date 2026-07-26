-- =============================================================================
-- HOZYN HOTEL ERP — RLS POLICIES (open / anon access)
-- Run this if RLS blocks any table operation.
-- All access control is handled at the app layer via the permissions system.
-- =============================================================================

do $$
declare
    t text;
    tables text[] := array[
        'hotel_settings','tax_config','room_type','roles','employees',
        'guests','rooms','reservations','folios','folio_charges','payments',
        'restaurant_categories','restaurant_items','restaurant_orders',
        'restaurant_order_items','hotel_services'
    ];
begin
    foreach t in array tables loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists "%s_select" on %I', t, t);
        execute format('drop policy if exists "%s_insert" on %I', t, t);
        execute format('drop policy if exists "%s_update" on %I', t, t);
        execute format('drop policy if exists "%s_delete" on %I', t, t);
        -- Legacy policy names from old schema
        execute format('drop policy if exists "anon_all_%s" on %I', t, t);
        execute format('create policy "%s_select" on %I for select using (true)', t, t);
        execute format('create policy "%s_insert" on %I for insert with check (true)', t, t);
        execute format('create policy "%s_update" on %I for update using (true)', t, t);
        execute format('create policy "%s_delete" on %I for delete using (true)', t, t);
    end loop;
end;
$$;

-- Reload schema cache after any structural change
notify pgrst, 'reload schema';
