import { supabase } from '@/api/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, KeyRound, Search, ShieldCheck, Trash2, Users } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

const ROLE_OPTIONS = ['cashier', 'admin']

export default function UserManagement({ tenants, profiles, currentUserId }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [addForm, setAddForm] = useState({ tenant_id: '', role: 'cashier' })
  const [busy, setBusy] = useState(false)

  const { data: memberships = [] } = useQuery({
    queryKey: ['platformMemberships'],
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships').select('*')
      if (error) throw new Error(error.message)
      return data || []
    },
  })

  const tenantName = (id) => tenants.find((t) => t.id === id)?.business_name || id?.slice(0, 8) || '—'

  const q = search.trim().toLowerCase()
  const visible = profiles.filter((p) => {
    const matchesSearch = !q
      || (p.full_name || '').toLowerCase().includes(q)
      || (p.email || '').toLowerCase().includes(q)
    const matchesTenant = tenantFilter === 'all' || p.tenant_id === tenantFilter
    return matchesSearch && matchesTenant
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platformMemberships'] })
    qc.invalidateQueries({ queryKey: ['platformProfiles'] })
  }

  const addMembership = async (userId) => {
    if (!addForm.tenant_id) return toast.error('Pick a business')
    setBusy(true)
    try {
      const { error } = await supabase.from('memberships').upsert(
        { user_id: userId, tenant_id: addForm.tenant_id, role: addForm.role },
        { onConflict: 'user_id,tenant_id' }
      )
      if (error) throw new Error(error.message)
      toast.success('Membership added')
      setAddForm({ tenant_id: '', role: 'cashier' })
      refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const changeMembershipRole = async (m, role) => {
    const { error } = await supabase.from('memberships').update({ role }).eq('id', m.id)
    if (error) return toast.error(error.message)
    toast.success('Membership role updated — takes effect next time the user switches into this business')
    refresh()
  }

  const removeMembership = async (m) => {
    setBusy(true)
    try {
      const { error } = await supabase.from('memberships').delete().eq('id', m.id)
      if (error) throw new Error(error.message)
      toast.success('Removed from business')
      refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleOwner = async (profile) => {
    setBusy(true)
    try {
      const nextRole = profile.platform_role === 'superadmin' ? null : 'superadmin'
      const { error } = await supabase.rpc('set_platform_role', { p_user: profile.id, p_role: nextRole })
      if (error) {
        if (/does not exist|not found/i.test(error.message)) {
          throw new Error('set_platform_role RPC is not installed yet — run supabase/migrations/0023_platform_user_admin.sql in the Dashboard SQL editor')
        }
        throw new Error(error.message)
      }
      toast.success(nextRole ? 'Platform Owner granted' : 'Platform Owner revoked')
      refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendPasswordReset = async (profile) => {
    if (!profile.email) return toast.error('This user has no email on file')
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw new Error(error.message)
      toast.success(`Password reset link sent to ${profile.email}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const renderExpanded = (p) => {
    const userMemberships = memberships.filter((m) => m.user_id === p.id)
    const availableTenants = tenants.filter((t) => !userMemberships.some((m) => m.tenant_id === t.id))
    return (
      <tr key={`${p.id}-detail`}>
        <td colSpan={6} className="px-4 py-4 bg-purple-50/40">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Memberships ({userMemberships.length})</div>
            {userMemberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between border rounded-lg p-2.5 bg-white">
                <div className="text-sm font-medium">{tenantName(m.tenant_id)}
                  {p.tenant_id === m.tenant_id && <span className="ml-2 text-xs text-pink font-semibold">active</span>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-md border border-input px-2 text-sm"
                    value={m.role}
                    onChange={(e) => changeMembershipRole(m, e.target.value)}
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || p.tenant_id === m.tenant_id}
                    onClick={() => removeMembership(m)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            {userMemberships.length === 0 && <p className="text-sm text-slate-400">No memberships yet</p>}

            {availableTenants.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border rounded-lg p-2.5 bg-white">
                <span className="text-xs text-slate-500 sm:w-40">Add to business:</span>
                <select
                  className="h-8 rounded-md border border-input px-2 text-sm flex-1"
                  value={addForm.tenant_id}
                  onChange={(e) => setAddForm({ ...addForm, tenant_id: e.target.value })}
                >
                  <option value="">Pick a business…</option>
                  {availableTenants.map((t) => <option key={t.id} value={t.id}>{t.business_name}</option>)}
                </select>
                <select
                  className="h-8 rounded-md border border-input px-2 text-sm"
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <Button size="sm" onClick={() => addMembership(p.id)} disabled={busy}>Add</Button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border rounded-lg p-2.5 bg-white">
              <span className="text-xs text-slate-500 sm:w-40">Password:</span>
              <p className="text-xs text-slate-400 flex-1">Emails a password reset link to {p.email || '—'}.</p>
              <Button size="sm" variant="outline" onClick={() => sendPasswordReset(p)} disabled={busy || !p.email}>
                <KeyRound className="w-3 h-3 mr-1" /> Send reset link
              </Button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Users className="w-4 h-4" /> User Management</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input className="pl-8 h-9 sm:w-56" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="h-9 rounded-md border border-input px-3 text-sm" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
            <option value="all">All businesses</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.business_name}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600">
            <tr>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Active Business</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Memberships</th>
              <th className="px-4 py-3 text-right">Platform Owner</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t">
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-slate-400 hover:text-slate-700">
                      {expanded === p.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {p.full_name || '—'}
                    {p.id === currentUserId && <span className="ml-2 text-xs text-pink">(you)</span>}
                    <div className="text-xs text-slate-400">{p.email || ''}</div>
                  </td>
                  <td className="px-4 py-3">{p.tenant_id ? tenantName(p.tenant_id) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 capitalize">{p.role}</td>
                  <td className="px-4 py-3 text-right">{memberships.filter((m) => m.user_id === p.id).length}</td>
                  <td className="px-4 py-3 text-right">
                    {p.id === currentUserId ? (
                      <span className="text-xs text-slate-400">{p.platform_role === 'superadmin' ? 'owner' : '—'}</span>
                    ) : (
                      <Button size="sm" variant={p.platform_role === 'superadmin' ? 'default' : 'outline'} disabled={busy} onClick={() => toggleOwner(p)}>
                        {p.platform_role === 'superadmin' ? 'Revoke' : 'Grant'}
                      </Button>
                    )}
                  </td>
                </tr>
                {expanded === p.id && renderExpanded(p)}
              </Fragment>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No users match</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        Membership role changes apply when the user next switches into that business.
      </div>
    </Card>
  )
}
