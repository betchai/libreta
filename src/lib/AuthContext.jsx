import { supabase } from '@/api/supabaseClient'
import { queryClient } from '@/lib/query-client'
import { createContext, useState, useCallback, useEffect, useContext } from 'react'
export const AuthContext = createContext(null)

// Normalize the authenticated user into the shape the app expects. A user has a
// profile row (created by trigger) carrying role / platform_role / tenant_id.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true)
  const [authError, setAuthError] = useState(null)

  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setProfile(null)
      return
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      if (error) throw error
      setProfile(data)
      setAuthError(null)
    } catch (e) {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    // On first load, restore the persisted session.
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      setSession(s)
      if (s?.user) await loadProfile(s.user)
      setIsLoadingAuth(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s?.user) loadProfile(s.user)
      else setProfile(null)
      if (event !== 'INITIAL_SESSION') setIsLoadingAuth(false)

      // Password-recovery links: Supabase exchanges the emailed code into a
      // session wherever the link lands (redirect_to may fall back to the
      // site URL root if not whitelisted). Catch it here and route the user
      // to the reset page so they are never signed straight in without
      // setting a new password.
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
        window.location.assign(`${window.location.origin}/reset-password`)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [loadProfile])

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        full_name: profile?.full_name ?? session.user.user_metadata?.full_name ?? '',
        role: profile?.role ?? 'user',
        platform_role: profile?.platform_role ?? null,
        tenant_id: profile?.tenant_id ?? null,
      }
    : null

  const signInWithEmail = (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signInWithOtp = (email) => supabase.auth.signInWithOtp({ email })

  const signUpWithEmail = (email, password) =>
    supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })

  const signOut = async () => {
    queryClient.clear()
    setProfile(null)
    await supabase.auth.signOut()
  }

  // Onboarding: submit the Business Code to link the current user to a tenant.
  const joinBusiness = useCallback(async (tenantId) => {
    const { data, error } = await supabase.rpc('join_business', { p_tenant: tenantId })
    if (error) throw new Error(error.message)
    // Profile changed server-side; re-fetch it.
    if (session?.user) await loadProfile(session.user)
    return data
  }, [session, loadProfile])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user)
  }, [session, loadProfile])

  // Switch the account's active business. Server-side validates membership and
  // re-points the profile (tenant + per-tenant role), which re-frames every RLS
  // policy and query. Clear the query cache so no stale cross-store data leaks.
  const switchBusiness = useCallback(async (tenantId) => {
    const { error } = await supabase.rpc('switch_business', { p_tenant: tenantId })
    if (error) throw new Error(error.message)
    queryClient.clear()
    if (session?.user) await loadProfile(session.user)
  }, [session, loadProfile])

  const value = {
    session,
    user,
    profile,
    isLoadingAuth,
    authError,
    signInWithEmail,
    signInWithOtp,
    signUpWithEmail,
    signOut,
    joinBusiness,
    refreshProfile,
    switchBusiness,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
