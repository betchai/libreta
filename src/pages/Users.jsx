import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTenantId } from '@/hooks/useTenantId'
import { useProfiles, useUpdateProfileRole, useInviteUser } from '@/hooks/useUsers'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { Key, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
export default function Users() {
  const { user, refreshProfile } = useAuth()
  const admin = isAdmin(user)
  const tenantId = useTenantId()
  const { data: profiles = [], isLoading } = useProfiles()
  const updateRole = useUpdateProfileRole()
  const invite = useInviteUser()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('cashier')
  const [copied, setCopied] = useState(false)

  const doInvite = () => {
    if (!email.trim()) return toast.error('Enter an email')
    invite.mutate({ email: email.trim(), role }, { onSuccess: () => { toast.success('Invitation sent'); setEmail('') }, onError: (e) => toast.error(e.message) })
  }

  const changeRole = (profile, newRole) => {
    updateRole.mutate({ profileId: profile.id, role: newRole }, { onSuccess: () => toast.success('Role updated'), onError: (e) => toast.error(e.message) })
  }

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(tenantId || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { toast.error('Copy failed') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-plum">Users</h1>
        <p className="text-slate-500">Manage your team and invites</p>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="w-5 h-5 text-pink" />
          <div>
            <div className="text-sm font-medium text-slate-800">Business Code</div>
            <div className="text-xs text-slate-400">Share this so staff can join on first login</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-slate-100 px-3 py-1.5 text-sm font-mono">{tenantId || '—'}</code>
          <Button variant="outline" size="sm" onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>
      </Card>

      {admin && (
        <Card className="p-4">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-3"><UserPlus className="w-4 h-4" /> Invite User</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1"><Label className="sr-only">Email</Label><Input placeholder="email@store.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doInvite()} /></div>
            <select className="h-9 rounded-md border border-input px-3 text-sm w-40" value={role} onChange={(e) => setRole(e.target.value)}><option value="cashier">Cashier</option><option value="admin">Admin</option></select>
            <Button onClick={doInvite} className="bg-pink hover:bg-pink/90" disabled={invite.isPending}>{invite.isPending ? 'Sending…' : 'Send Invitation'}</Button>
          </div>
        </Card>
      )}

      {isLoading ? <div className="py-10 text-center text-slate-400">Loading…</div> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-purple-50 text-left text-xs uppercase text-purple-600"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.full_name || '—'}{p.id === user?.id && <span className="ml-2 text-xs text-pink">(you)</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{p.email}</td>
                  <td className="px-4 py-3">
                    {isAdmin(user) && p.id !== user?.id ? (
                      <select className="h-9 rounded-md border border-input px-3 text-sm" value={p.platform_role === 'superadmin' ? 'superadmin' : p.role} disabled={p.platform_role === 'superadmin'} onChange={(e) => changeRole(p, e.target.value)}>
                        <option value="cashier">Cashier</option><option value="admin">Admin</option>{p.platform_role === 'superadmin' && <option value="superadmin">Platform Owner</option>}
                      </select>
                    ) : (
                      <span className="capitalize">{p.platform_role === 'superadmin' ? 'Platform Owner' : p.role}</span>
                    )}
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No team members yet</td></tr>}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  )
}
