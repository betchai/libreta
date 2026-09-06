import { base44 } from '@/api/base44Client'
import { supabase } from '@/api/supabaseClient'
import { useTenantId } from '@/hooks/useTenantId'
import { useAuth } from '@/lib/AuthContext'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
export function useProfiles() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const isSuper = user?.platform_role === 'superadmin'
  return useQuery({
    queryKey: ['profiles', tenantId, isSuper],
    enabled: !!tenantId || isSuper,
    queryFn: async () => {
      if (window.__DEMO__) {
        return [{ id: 'demo-user-id', full_name: 'Demo User', email: 'demo@libreta.app', role: 'admin', tenant_id: 'demo-tenant-id' }]
      }
      let q = supabase.from('profiles').select('*')
      if (!isSuper) q = q.eq('tenant_id', tenantId)
      const { data, error } = await q.order('full_name')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useUpdateProfileRole() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const isSuper = user?.platform_role === 'superadmin'
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ profileId, role }) => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries(['profiles', tenantId, isSuper]),
  })
}

export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, role }) => base44.users.inviteUser(email, role),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'profiles' }),
  })
}
