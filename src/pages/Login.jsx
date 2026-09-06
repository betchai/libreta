import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/AuthContext'
import { base44 } from '@/api/base44Client'
import { Store } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
export default function Login() {
  const { signInWithEmail, signInWithOtp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const submitPassword = async (e) => {
    e.preventDefault()
    if (!email.trim()) return toast.error('Enter your email')
    setBusy(true)
    const { error } = await signInWithEmail(email.trim(), password)
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Signed in')
    navigate('/', { replace: true })
  }

  const sendMagicLink = async () => {
    if (!email.trim()) return toast.error('Enter your email')
    const normalized = email.trim().toLowerCase()

    if (!window.__DEMO__) {
      const { data: invited, error: inviteErr } = await base44.rpc('check_invitation_exists', { p_email: normalized })
      if (inviteErr) return toast.error(inviteErr.message)
      if (!invited) return toast.error('No invitation found for this email. Please contact your admin to register your business first.')
    }

    setBusy(true)
    const { error } = await signInWithOtp(normalized)
    setBusy(false)
    if (error) return toast.error(error.message)
    setMagicLinkSent(true)
    toast.success('Magic link sent — check your inbox')
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
            <CardTitle style={{ color: '#4A1D3F' }}>Sign in</CardTitle>
            <CardDescription>Access your Libreta account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submitPassword} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={sendMagicLink} disabled={busy}>
              {magicLinkSent ? 'Link sent' : 'Email me a magic link'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
