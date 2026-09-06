import { supabase } from '@/api/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

// Password-recovery landing page. The reset link Supabase emails points here;
// the client (detectSessionInUrl) exchanges the recovery code into a session,
// then this page lets the user set a new password.
export default function ResetPassword() {
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase surfaces expired/invalid links as ?error=… on the redirect.
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      setLinkError(params.get('error_description') || 'This reset link is invalid or has expired.')
      setChecking(false)
      return
    }

    let unsub = () => {}
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setHasSession(true)
        setChecking(false)
        return
      }
      // PKCE exchange may still be in flight — wait for the auth event.
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
          setHasSession(true)
          setChecking(false)
        }
      })
      unsub = () => sub.subscription.unsubscribe()
      // Timeout: no session materialized → treat as an invalid link.
      setTimeout(() => setChecking(false), 5000)
    })()
    return () => unsub()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    if (password !== confirm) return toast.error('Passwords do not match')
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      setDone(true)
      toast.success('Password updated')
      setTimeout(() => { window.location.assign(window.location.origin) }, 1500)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
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
            <CardTitle className="text-plum flex items-center gap-2"><KeyRound className="w-5 h-5" /> Set a new password</CardTitle>
            {checking ? (
              <CardDescription>Verifying your reset link…</CardDescription>
            ) : linkError ? (
              <CardDescription className="text-rose-500">{linkError}</CardDescription>
            ) : (
              <CardDescription>Choose a new password for your account.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {checking && (
              <div className="flex justify-center py-4">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
              </div>
            )}
            {linkError && (
              <Button className="w-full" onClick={() => window.location.assign(window.location.origin + '/login')}>
                <LogIn className="w-4 h-4" /> Go to sign in
              </Button>
            )}
            {!checking && hasSession && !done && (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>New password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
                </div>
                <div className="space-y-2">
                  <Label>Confirm password</Label>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full bg-pink hover:bg-pink/90" disabled={saving}>
                  {saving ? 'Saving…' : 'Update password'}
                </Button>
              </form>
            )}
            {done && (
              <p className="text-sm text-slate-500 text-center py-2">Password updated. Redirecting to the app…</p>
            )}
            {!checking && !hasSession && !linkError && (
              <>
                <p className="text-sm text-rose-500">This reset link is invalid or has expired.</p>
                <Button className="w-full" onClick={() => window.location.assign(window.location.origin + '/login')}>
                  <LogIn className="w-4 h-4" /> Go to sign in
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
