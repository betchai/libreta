// Current user's tenant_id (the Business Code). Null until onboarding completes.
import { useAuth } from '@/lib/AuthContext'
export function useTenantId() {
  const { user } = useAuth()
  return user?.tenant_id || null
}
