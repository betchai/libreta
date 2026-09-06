// Defaults mirror the Seeds in the Base44 app (Settings entity).
import { supabase } from '@/api/supabaseClient'
import { useTenantId } from '@/hooks/useTenantId'
import { useQuery } from '@tanstack/react-query'
export const DEFAULT_SETTINGS = {
  business_name: 'My Store',
  business_type: '',
  currency: 'PHP',
  currency_symbol: '₱',
  categories: ['Feed', 'Medicine', 'Tools', 'Supplement', 'Other'],
  units: ['Sack', 'Bottle', 'Piece', 'Kg', 'Box', 'Pack'],
  low_stock_default: 5,
  default_markup_percentage: 20,
  vat_inclusive: true,
  vat_registered: true,
  vat_rate: 0.12,
  enforce_credit_limit: false,
  window_days: 90,
  lead_time_days: 3,
  safety_stock_days: 5,
  review_interval_days: 7,
}

export function useSettings() {
  const tenantId = useTenantId()
  const q = useQuery({
    queryKey: ['settings', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (window.__DEMO__) {
        const { DEMO_SETTINGS } = await import('@/lib/demoData')
        return { ...DEFAULT_SETTINGS, ...DEMO_SETTINGS }
      }
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return { ...DEFAULT_SETTINGS, ...(data || {}) }
    },
  })
  // Expose both `settings` (used by POS components) and standard `data` aliases.
  return { ...q, settings: q.data }
}
