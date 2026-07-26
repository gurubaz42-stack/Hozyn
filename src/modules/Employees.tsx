import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { Modal, Field, PageLoader, ErrorBanner } from '../ui'

interface LoggedInUser {
  id: string
  employee_name: string
  role_name: string | null
  department: string | null
  login_id: string
  permissions: string[]
}

interface Employee {
  id: string
  employee_number: string | null
  employee_name: string
  email: string | null
  phone: string | null
  role_id: string | null
  joining_date: string | null
  is_active: boolean
  login_id: string | null
  login_password: string | null
  roles?: { id: string; role_name: string; department: string | null; permissions: string[] } | null
}

interface Role {
  id: string
  role_name: string
  department: string | null
  permissions: string[]
}

const PERMISSION_OPTIONS = [
  'dashboard', 'guests', 'rooms', 'reservations', 'restaurant',
  'services', 'checkout', 'reports', 'employees', 'settings', 'all'
]

export default function Employees({ currentUser }: { currentUser: LoggedInUser }) {
  const isAdmin =
    currentUser.permissions?.includes('all') ||
    currentUser.role_name?.toLowerCase() === 'admin' ||
    currentUser.login_id?.toLowerCase() === 'admin'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [tab, setTab] = useState<'list' | 'roles'>('list')
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState<{
    employee_name: string; email: string; phone: string
    role_id: string; joining_date: string; is_active: boolean
    login_id: string; login_password: string
  }>({ employee_name: '', email: '', phone: '', role_id: '', joining_date: '', is_active: true, login_id: '', login_password: '' })

  // Role edit state
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [roleForm, setRoleForm] = useState<{ role_name: string; department: string; permissions: string[] }>({ role_name: '', department: '', permissions: [] })
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleSaveError, setRoleSaveError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [empRes, rolesRes] = await Promise.all([
      supabase.from('employees').select('*, roles(id, role_name, department, permissions)').order('employee_name'),
      supabase.from('roles').select('id, role_name, department, permissions').order('role_name'),
    ])
    if (empRes.error) { setError(empRes.error.message); setLoading(false); return }
    setEmployees((empRes.data || []) as Employee[])
    setRoles((rolesRes.data || []) as Role[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useRealtime(['employees', 'roles'], load)

  const openAdd = () => {
    setForm({ employee_name: '', email: '', phone: '', role_id: '', joining_date: '', is_active: true, login_id: '', login_password: '' })
    setShowPass(false); setEditEmp(null); setSaveError(null); setShowModal(true)
  }
  const openEdit = (e: Employee) => {
    setForm({
      employee_name: e.employee_name,
      email: e.email || '',
      phone: e.phone || '',
      role_id: e.role_id || '',
      joining_date: e.joining_date || '',
      is_active: e.is_active,
      login_id: e.login_id || '',
      login_password: '',
    })
    setShowPass(false); setEditEmp(e); setSaveError(null); setShowModal(true)
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!form.employee_name.trim()) { setSaveError('Employee name is required.'); return }
    if (!editEmp && !form.login_id.trim()) { setSaveError('User ID is required for new employees.'); return }
    if (!editEmp && !form.login_password.trim()) { setSaveError('Password is required for new employees.'); return }

    if (form.login_id.trim()) {
      const { data: existing } = await supabase.from('employees')
        .select('id, employee_name').eq('login_id', form.login_id.trim()).maybeSingle()
      if (existing && existing.id !== editEmp?.id) {
        setSaveError(`User ID "${form.login_id}" is already taken by ${existing.employee_name}.`); return
      }
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      employee_name: form.employee_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      role_id: form.role_id || null,
      joining_date: form.joining_date || null,
      is_active: form.is_active,
      login_id: form.login_id.trim() || null,
    }
    if (form.login_password.trim()) payload.login_password = form.login_password.trim()

    const { error: err } = editEmp
      ? await supabase.from('employees').update(payload).eq('id', editEmp.id)
      : await supabase.from('employees').insert(payload)
    if (err) { setSaveError(err.message); setSaving(false); return }
    setSaving(false); setShowModal(false); load()
  }

  const toggleActive = async (emp: Employee) => {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id)
    load()
  }

  // Role modal handlers
  const openAddRole = () => {
    setEditRole(null)
    setRoleForm({ role_name: '', department: '', permissions: [] })
    setRoleSaveError(null)
    setShowRoleModal(true)
  }
  const openEditRole = (role: Role) => {
    setEditRole(role)
    setRoleForm({ role_name: role.role_name, department: role.department || '', permissions: Array.isArray(role.permissions) ? [...role.permissions] : [] })
    setRoleSaveError(null)
    setShowRoleModal(true)
  }
  const togglePermission = (perm: string) => {
    setRoleForm(prev => {
      if (perm === 'all') {
        return { ...prev, permissions: prev.permissions.includes('all') ? [] : ['all'] }
      }
      const without = prev.permissions.filter(p => p !== perm && p !== 'all')
      return { ...prev, permissions: prev.permissions.includes(perm) ? without : [...without, perm] }
    })
  }
  const handleSaveRole = async () => {
    setRoleSaveError(null)
    if (!roleForm.role_name.trim()) { setRoleSaveError('Role name is required.'); return }
    setRoleSaving(true)
    const payload = { role_name: roleForm.role_name.trim(), department: roleForm.department.trim() || null, permissions: roleForm.permissions }
    const { error: err } = editRole
      ? await supabase.from('roles').update(payload).eq('id', editRole.id)
      : await supabase.from('roles').insert(payload)
    if (err) { setRoleSaveError(err.message); setRoleSaving(false); return }
    setRoleSaving(false); setShowRoleModal(false); load()
  }
  const handleDeleteRole = async (roleId: string) => {
    const inUse = employees.some(e => e.role_id === roleId)
    if (inUse) { setDeleteConfirm(null); return }
    await supabase.from('roles').delete().eq('id', roleId)
    setDeleteConfirm(null); load()
  }

  if (loading) return <PageLoader label="Loading employees…" />
  if (error) return <ErrorBanner msg={error} onRetry={load} />

  return (
    <div className="fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['list', 'roles'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 18px', borderRadius: 6, border: '1.5px solid', borderColor: tab === t ? '#0D1F40' : '#E2E8F0', background: tab === t ? '#0D1F40' : 'white', color: tab === t ? 'white' : '#64748B', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            {t === 'list' ? `Employees (${employees.length})` : 'Roles & Permissions'}
          </button>
        ))}
      </div>

      {tab === 'list' ? (
        <div className="erp-card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1F40', fontFamily: "'Playfair Display', serif" }}>Staff Directory</div>
            <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr><th>Emp #</th><th>Name</th><th>User ID</th><th>Phone</th><th>Role</th><th>Department</th><th>Joined</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {employees.length === 0
                  ? <tr key="empty"><td colSpan={9} style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>No employees found</td></tr>
                  : employees.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#0D1F40' }}>
                        {e.employee_number || e.id.slice(0, 8)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0D1F40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {e.employee_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{e.employee_name}</span>
                        </div>
                      </td>
                      <td>
                        {e.login_id
                          ? <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#EFF2F8', padding: '2px 8px', borderRadius: 6, color: '#0D1F40' }}>@{e.login_id}</span>
                          : <span style={{ fontSize: 12, color: '#EF4444' }}>⚠ No login set</span>
                        }
                      </td>
                      <td style={{ fontSize: 12.5 }}>{e.phone || '—'}</td>
                      <td style={{ fontSize: 12.5, fontWeight: 500 }}>{e.roles?.role_name || '—'}</td>
                      <td><span style={{ fontSize: 11, padding: '2px 8px', background: '#EFF2F8', borderRadius: 4, color: '#0D1F40', fontWeight: 600 }}>{e.roles?.department || '—'}</span></td>
                      <td style={{ fontSize: 12.5 }}>{e.joining_date || '—'}</td>
                      <td>
                        <button onClick={() => toggleActive(e)} style={{ padding: '2px 9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, background: e.is_active ? '#D1FAE5' : '#F1F5F9', color: e.is_active ? '#065F46' : '#64748B' }}>
                          {e.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <button onClick={() => openEdit(e)} style={{ padding: '4px 9px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#64748B' }}>
              {isAdmin ? 'Admin: You can add, edit, and delete roles.' : 'View-only — only admins can modify roles.'}
            </div>
            {isAdmin && (
              <button className="btn-primary" onClick={openAddRole}>+ Add Role</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
            {roles.length === 0
              ? <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94A3B8' }}>No roles defined</div>
              : roles.map(role => {
                const empCount = employees.filter(e => e.role_id === role.id).length
                const perms = Array.isArray(role.permissions) ? role.permissions : []
                return (
                  <div key={role.id} className="erp-card" style={{ padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0D1F40' }}>{role.role_name}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, padding: '3px 8px', background: '#EFF2F8', borderRadius: 4, color: '#0D1F40', fontWeight: 600 }}>{role.department || '—'}</span>
                        {isAdmin && (
                          <>
                            <button onClick={() => openEditRole(role)} style={{ padding: '3px 9px', border: '1px solid #C7D2E8', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#0D1F40' }}>Edit</button>
                            {empCount === 0 && (
                              deleteConfirm === role.id
                                ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => handleDeleteRole(role.id)} style={{ padding: '3px 8px', border: 'none', borderRadius: 5, background: '#EF4444', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'white' }}>Yes</button>
                                    <button onClick={() => setDeleteConfirm(null)} style={{ padding: '3px 8px', border: '1px solid #E2E8F0', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11 }}>No</button>
                                  </div>
                                )
                                : <button onClick={() => setDeleteConfirm(role.id)} style={{ padding: '3px 7px', border: '1px solid #FECACA', borderRadius: 5, background: 'white', cursor: 'pointer', fontSize: 11, color: '#EF4444' }}>✕</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10 }}>{empCount} employee{empCount !== 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {perms.includes('all')
                        ? <span style={{ fontSize: 11, padding: '2px 8px', background: '#FEF7E4', borderRadius: 4, color: '#92400E', fontWeight: 600 }}>Full Access</span>
                        : perms.length > 0
                          ? perms.map((p: string) => <span key={p} style={{ fontSize: 11, padding: '2px 8px', background: '#DBEAFE', borderRadius: 4, color: '#1E40AF', fontWeight: 600 }}>{p}</span>)
                          : <span style={{ fontSize: 11, color: '#94A3B8' }}>No permissions set</span>
                      }
                    </div>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}

      {/* Employee modal */}
      {showModal && (
        <Modal title={editEmp ? `Edit — ${editEmp.employee_name}` : 'Add Employee'} onClose={() => setShowModal(false)} maxWidth={560}>
          <div>
            <div style={{ background: '#EFF2F8', border: '1.5px solid #C7D2E8', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0D1F40', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>🔐 Login Credentials</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="User ID">
                  <input
                    className="erp-input"
                    placeholder="e.g. john.doe"
                    value={form.login_id}
                    onChange={e => setForm(p => ({ ...p, login_id: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                    autoComplete="off"
                  />
                </Field>
                <Field label={editEmp ? 'New Password (leave blank to keep)' : 'Password'}>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="erp-input"
                      type={showPass ? 'text' : 'password'}
                      placeholder={editEmp ? '••••••• (unchanged)' : 'Set a password'}
                      value={form.login_password}
                      onChange={e => setForm(p => ({ ...p, login_password: e.target.value }))}
                      autoComplete="new-password"
                      style={{ paddingRight: 36 }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14 }}>
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                </Field>
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 8 }}>Employee logs in using their User ID and password.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Full Name">
                <input className="erp-input" placeholder="Employee name" value={form.employee_name} onChange={e => setForm(p => ({ ...p, employee_name: e.target.value }))} />
              </Field>
              <Field label="Email">
                <input className="erp-input" type="email" placeholder="email@hotel.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="Phone">
                <input className="erp-input" placeholder="+91 98xxx xxxxx" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </Field>
              <Field label="Joining Date">
                <input className="erp-input" type="date" value={form.joining_date} onChange={e => setForm(p => ({ ...p, joining_date: e.target.value }))} />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Role">
                  <select className="erp-input" value={form.role_id} onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))}>
                    <option value="">Select role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.role_name} — {r.department || '—'}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, color: '#475569' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: '#C9A84C', width: 15, height: 15 }} />
                  Active Employee (can log in)
                </label>
              </div>
            </div>
            {saveError && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>⚠️ {saveError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editEmp ? 'Update Employee' : 'Add Employee'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Role edit modal (admin only) */}
      {showRoleModal && isAdmin && (
        <Modal title={editRole ? `Edit Role — ${editRole.role_name}` : 'Add Role'} onClose={() => setShowRoleModal(false)} maxWidth={500}>
          <div>
            {roleSaveError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>⚠️ {roleSaveError}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <Field label="Role Name">
                <input className="erp-input" placeholder="e.g. Front Desk" value={roleForm.role_name} onChange={e => setRoleForm(p => ({ ...p, role_name: e.target.value }))} />
              </Field>
              <Field label="Department">
                <input className="erp-input" placeholder="e.g. Operations" value={roleForm.department} onChange={e => setRoleForm(p => ({ ...p, department: e.target.value }))} />
              </Field>
            </div>

            <Field label="Permissions">
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                  Select "All (Admin)" to grant full access, or pick specific modules.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PERMISSION_OPTIONS.map(perm => {
                    const selected = roleForm.permissions.includes(perm)
                    const isAll = perm === 'all'
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => togglePermission(perm)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          border: `1.5px solid ${selected ? (isAll ? '#92400E' : '#1E40AF') : '#E2E8F0'}`,
                          background: selected ? (isAll ? '#FEF7E4' : '#DBEAFE') : 'white',
                          color: selected ? (isAll ? '#92400E' : '#1E40AF') : '#64748B',
                          fontSize: 12,
                          fontWeight: selected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          textTransform: isAll ? 'uppercase' : 'capitalize',
                        }}
                      >
                        {isAll ? 'All (Admin)' : perm}
                        {selected && ' ✓'}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button className="btn-ghost" onClick={() => setShowRoleModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveRole} disabled={roleSaving}>
                {roleSaving ? 'Saving…' : editRole ? 'Update Role' : 'Add Role'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
