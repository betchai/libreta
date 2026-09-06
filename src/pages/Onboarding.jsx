import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSuperadmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { Store, Building2, LogOut } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
export default function Onboarding() {
  const { user, joinBusiness, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return toast.error('Enter the Business Code')
    setBusy(true)
    try {
      await joinBusiness(trimmed)
      toast.success('Business joined. Welcome!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.assign(window.location.origin)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--paper)', color: '#4A1D3F' }}>
      <div className="w-full max-w-sm">
        <a href="/" className="flex items-center justify-center gap-3 mb-6 no-underline">
          <img src="/libreta.ico" alt="Libreta" className="w-11 h-11 rounded-2xl" />
          <div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans', color: '#4A1D3F' }}>Libreta</div>
            <div className="text-[10px] uppercase tracking-[.2em] text-slate-400 font-bold">One clear record</div>
          </div>
        </a>
        <Card className="paper-card">
          <CardHeader>
            <CardTitle className="text-plum flex items-center gap-2"><Building2 className="w-5 h-5" /> Join your business</CardTitle>
            <CardDescription>
              You're signed in as <span className="font-medium">{user?.email}</span>. Enter the Business Code shared by your admin to link to your store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Business Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g., 7f3b…" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Joining…' : 'Join business'}
              </Button>
            </form>
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </div>
            {!isSuperadmin(user) && (
              <p className="text-xs text-muted-foreground text-center">
                No code yet? Ask your store admin for the Business Code on the Users page, or the platform owner.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
