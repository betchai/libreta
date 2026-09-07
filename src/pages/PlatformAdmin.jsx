import { base44 } from '@/api/base44Client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import UserManagement from '@/components/platform/UserManagement'
import { isSuperadmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Copy, Send, ShieldCheck, Store } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export default function PlatformAdmin() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const superadmin = isSuperadmin(user)

  // ---- Create-business form (create_business RPC assigns the Business Code) ----
  const [form, setForm] = useState({ business_name: '', business_type: '', admin_email: '', admin_role: 'admin' })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  // ---- Platform-wide invite form ----
  const [inviteForm, setInviteForm] = useState({ tenant_id: '', email: '', role: 'cashier' })
  const [inviting, setInviting] = useState(false)

  // ---- Tenants (RLS: superadmin sees all) ----
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['platformTenants'],
    enabled: superadmin,
    queryFn: () => base44.entities.Tenant.list('created_date', 1000),
  })

  // ---- All profiles (superadmin) for per-store user counts ----
  const { data: profiles = [] } = useQuery({
    queryKey: ['platformProfiles'],
    enabled: superadmin,
    queryFn: () => base44.entities.User.list('created_date', 1000),
  })

  // ---- Invitations (RLS: superadmin sees all) ----
  const { data: invites = [] } = useQuery({
    queryKey: ['platformInvites'],
    enabled: superadmin,
    queryFn: () => base44.entities.TenantInvitation.filter({}, '-created_date', 1000),
  })

  const countFor = (tenantId) => profiles.filter((p) => p.tenant_id === tenantId).length

  const copyCode = async (id) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(id)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  const createBusiness = async () => {
    if (!form.business_name.trim()) return toast.error('Enter a business name')
    setCreating(true)
    try {
      const { data: id, error } = await base44.rpc('create_business', {
        p_business_name: form.business_name.trim(),
        p_business_type: form.business_type.trim() || null,
        p_admin_email: form.admin_email.trim() || null,
        p_admin_role: form.admin_role,
      })
      if (error) throw new Error(error.message)
      toast.success(id ? `Business created — Business Code ${id}` : 'Business created')
      setForm({ business_name: '', business_type: '', admin_email: '', admin_role: 'admin' })
      qc.invalidateQueries({ queryKey: ['platformTenants'] })
      qc.invalidateQueries({ queryKey: ['platformInvites'] })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCreating(false)
    }
  }

  const sendInvite = async () => {
    if (!inviteForm.tenant_id) return toast.error('Pick a business')
    if (!inviteForm.email.trim()) return toast.error('Enter an email')
    setInviting(true)
    try {
      await base44.users.inviteTo(inviteForm.email.trim(), inviteForm.role, inviteForm.tenant_id)
      toast.success('Invitation sent')
      setInviteForm({ tenant_id: inviteForm.tenant_id, email: '', role: 'cashier' })
      qc.invalidateQueries({ queryKey: ['platformInvites'] })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setInviting(false)
    }
  }

  // ---- Non-superadmin guard (route is reachable by URL; RLS blocks data) ----
  if (!superadmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-plum">Platform Admin</h1>
          <p className="text-slate-500">Superadmin console for managing businesses</p>
        </div>
        <Card className="p-8 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">Platform Admin requires a platform owner (superadmin) account.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-plum">Platform Admin</h1>
        <p className="text-slate-500">Create businesses, assign Business Codes, and invite users across the platform</p>
      </div>

      {/* ---- Tenants ---- */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800"><Building2 className="w-4 h-4" /> Businesses</h3>
          <span className="text-xs text-slate-400">{tenants.length} total</span>
        </div>
        {tenantsLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3 text-right">Users</th>
                  <th className="px-4 py-3">Business Code</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {t.business_name}
                      <div className="text-xs text-slate-400">
                        {t.business_type || ''}
                        {t.status !== 'active' && <span className="text-rose-500"> · {t.status}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{countFor(t.id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{t.id}</code>
                        <Button size="sm" variant="outline" onClick={() => copyCode(t.id)}>
                          <Copy className="w-3 h-3 mr-1" />{copied === t.id ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{t.created_date ? new Date(t.created_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No businesses yet — create one below</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Create Business (assigns the Business Code via create_business RPC) ---- */}
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><Store className="w-4 h-4" /> Create Business</h3>
        <p className="text-xs text-slate-400 mb-4">Seeds settings, chart of accounts, and expense categories. The Business Code is assigned automatically.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Business Name</Label>
            <Input placeholder="e.g. Blink Merchandise" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Business Type</Label>
            <Input placeholder="e.g. Retail / Range / Grocery" value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Admin Email (optional invitation)</Label>
            <Input placeholder="admin@store.com" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Admin Role</Label>
            <select className="h-9 w-full rounded-md border border-input px-3 text-sm" value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="cashier">Cashier</option>
            </select>
          </div>
        </div>
        <Button className="mt-4 bg-pink hover:bg-pink/90" onClick={createBusiness} disabled={creating}>
          {creating ? 'Creating…' : 'Create Business'}
        </Button>
      </Card>

      {/* ---- User Management (platform admin only) ---- */}
      <UserManagement tenants={tenants} profiles={profiles} currentUserId={user?.id} />

      {/* ---- Invite User (platform-wide) ---- */}
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><Send className="w-4 h-4" /> Invite User</h3>
        <p className="text-xs text-slate-400 mb-4">Send an invitation to join any business on the platform.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="h-9 rounded-md border border-input px-3 text-sm sm:w-56" value={inviteForm.tenant_id} onChange={(e) => setInviteForm({ ...inviteForm, tenant_id: e.target.value })}>
            <option value="">Pick a business…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.business_name}</option>)}
          </select>
          <Input className="flex-1" placeholder="email@store.com" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && sendInvite()} />
          <select className="h-9 rounded-md border border-input px-3 text-sm w-36" value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </select>
          <Button onClick={sendInvite} className="bg-pink hover:bg-pink/90" disabled={inviting}>
            {inviting ? 'Sending…' : 'Send Invitation'}
          </Button>
        </div>
      </Card>

      {/* ---- Pending Invitations ---- */}
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-3">Pending Invitations</h3>
        <div className="space-y-2">
          {invites.filter((i) => i.status === 'pending').map((i) => (
            <div key={i.id} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <div className="font-medium text-sm">{i.email}</div>
                <div className="text-xs text-slate-400">{i.tenant_name} · <span className="capitalize">{i.role}</span></div>
              </div>
              <span className="text-xs text-amber-600">pending</span>
            </div>
          ))}
          {invites.filter((i) => i.status === 'pending').length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No pending invitations</p>
          )}
        </div>
      </Card>

    </div>
  )
}
