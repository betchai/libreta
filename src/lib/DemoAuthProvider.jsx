import { AuthContext } from '@/lib/AuthContext'
import { DEMO_USER, DEMO_SETTINGS } from '@/lib/demoData'

export default function DemoAuthProvider({ children }) {
  const value = {
    session: { user: { id: 'demo-user-id', email: 'demo@libreta.app', user_metadata: { full_name: 'Demo User' } } },
    user: DEMO_USER,
    profile: { ...DEMO_USER },
    isLoadingAuth: false,
    authError: null,
    signInWithEmail: async () => { throw new Error('This is a demo. Sign in is not available.') },
    signInWithOtp: async () => { throw new Error('This is a demo. Sign in is not available.') },
    signUpWithEmail: async () => { throw new Error('This is a demo. Sign up is not available.') },
    signOut: async () => { window.location.assign('/') },
    joinBusiness: async () => {},
    refreshProfile: async () => {},
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}