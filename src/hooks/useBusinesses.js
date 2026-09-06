// Businesses the current account can operate (via memberships). Used by the
// sidebar business switcher. Returns [{ id, name, role }] plus the active flag.
import { supabase } from '@/api/supabaseClient'
import { useAuth } from '@/lib/AuthContext'
import { useQuery } from '@tanstack/react-query'

export function useBusinesses() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['businesses', user?.id],
    enabled: !!user && !window.__DEMO__,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('tenant_id, role, tenants(business_name)')
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      return (data || []).map((m) => ({
        id: m.tenant_id,
        name: m.tenants?.business_name || 'Untitled Business',
        role: m.role,
        isActive: user.tenant_id === m.tenant_id,
      }))
    },
  })
}