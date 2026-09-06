import { supabase } from '@/api/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSettings, DEFAULT_SETTINGS } from '@/hooks/useSettings'
import { useTenantId } from '@/hooks/useTenantId'
import { isAdmin } from '@/lib/auth-roles'
import { useAuth } from '@/lib/AuthContext'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Lock, Store, Tag, X, Plus, Scale, Save, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
export default function SettingsPage() {
  const { user } = useAuth()
  const tenantId = useTenantId()
  const { data: settings, isLoading } = useSettings()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(DEFAULT_SETTINGS)
  const [newCategory, setNewCategory] = useState('')
  const [newUnit, setNewUnit] = useState('')

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name || '',
        business_type: settings.business_type || '',
        currency: settings.currency || 'PHP',
        currency_symbol: settings.currency_symbol || '₱',
        categories: settings.categories || [],
        units: settings.units || [],
        low_stock_default: settings.low_stock_default ?? 5,
        default_markup_percentage: settings.default_markup_percentage ?? 20,
        vat_inclusive: settings.vat_inclusive ?? true,
        vat_registered: settings.vat_registered ?? true,
        vat_rate: settings.vat_rate ?? 0.12,
        enforce_credit_limit: settings.enforce_credit_limit ?? false,
        window_days: settings.window_days ?? 90,
        lead_time_days: settings.lead_time_days ?? 3,
        safety_stock_days: settings.safety_stock_days ?? 5,
        review_interval_days: settings.review_interval_days ?? 7,
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (window.__DEMO__) return
      const { data: existing } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
      const payload = { ...data, tenant_id: tenantId }
      if (existing) {
        const { error } = await supabase.from('business_settings').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('business_settings').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['settings', tenantId])
      toast.success(window.__DEMO__ ? 'Demo: settings updated (not saved)' : 'Settings saved')
    },
    onError: (err) => {
      const msg = err?.message || String(err)
      toast.error(/403|forbidden|permission|unauthorized/i.test(msg) ? 'Only admins can change settings.' : 'Failed to save: ' + msg)
    },
  })

  const handleSave = () => {
    if (!form.business_name.trim()) return toast.error('Business name is required')
    saveMutation.mutate(form)
  }

  const addCategory = () => {
    const val = newCategory.trim()
    if (!val) return
    if (!form.categories.includes(val)) setForm((p) => ({ ...p, categories: [...p.categories, val] }))
    setNewCategory('')
  }
  const removeCategory = (c) => setForm((p) => ({ ...p, categories: p.categories.filter((x) => x !== c) }))
  const addUnit = () => {
    const val = newUnit.trim()
    if (!val) return
    if (!form.units.includes(val)) setForm((p) => ({ ...p, units: [...p.units, val] }))
    setNewUnit('')
  }
  const removeUnit = (u) => setForm((p) => ({ ...p, units: p.units.filter((x) => x !== u) }))
  const resetDefaults = () => {
    setForm((p) => ({
      ...p,
      categories: DEFAULT_SETTINGS.categories,
      units: DEFAULT_SETTINGS.units,
      low_stock_default: DEFAULT_SETTINGS.low_stock_default,
      default_markup_percentage: DEFAULT_SETTINGS.default_markup_percentage,
    }))
    toast.info('Restored default categories and units')
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-pink rounded-full animate-spin" /></div>
  }

  if (!isAdmin(user)) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> Admin access required</CardTitle>
            <CardDescription>Settings can only be viewed and changed by admin accounts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-plum">Settings</h1>
        <p className="text-slate-500">Configure your business profile so the app adapts to your store type</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-pink" /> Business Profile</CardTitle>
          <CardDescription>This name appears across the app (sidebar, receipts, reports)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={form.business_name} onChange={(e) => setForm((p) => ({ ...p, business_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Business Type</Label>
              <Input value={form.business_type} onChange={(e) => setForm((p) => ({ ...p, business_type: e.target.value }))} placeholder="Mini Store, Agricultural Supply…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency Code</Label>
              <Input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Currency Symbol</Label>
              <Input value={form.currency_symbol} onChange={(e) => setForm((p) => ({ ...p, currency_symbol: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VAT Settings</CardTitle>
          <CardDescription>Your tax registration determines which BIR forms you file; how prices are quoted is separate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>VAT-registered business</Label>
              <p className="text-xs text-slate-500">On = VAT-registered (file 2550Q, charge/remit 12% VAT, claim input VAT). Off = non-VAT — percentage tax (2551Q) and no input VAT claim.</p>
            </div>
            <Switch checked={form.vat_registered} onCheckedChange={(c) => setForm((p) => ({ ...p, vat_registered: c }))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Prices are VAT-inclusive</Label>
              <p className="text-xs text-slate-500">On = sale prices already include VAT (retail default). Off = list prices exclude VAT — 12% is added on top at checkout and recorded as Output VAT.</p>
            </div>
            <Switch checked={form.vat_inclusive} onCheckedChange={(c) => setForm((p) => ({ ...p, vat_inclusive: c }))} />
          </div>
          <div className="space-y-2 max-w-[160px]">
            <Label>VAT Rate</Label>
            <Input type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm((p) => ({ ...p, vat_rate: Number(e.target.value) }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tag className="w-5 h-5 text-pink" /> Product Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {form.categories.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 bg-pink/10 text-plum border border-pink/20 rounded-full pl-3 pr-1.5 py-1 text-sm">
                {c}
                <button onClick={() => removeCategory(c)} className="text-pink/80 hover:text-red-500 rounded-full p-0.5"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add a category" value={newCategory} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }} onChange={(e) => setNewCategory(e.target.value)} />
            <Button variant="outline" onClick={addCategory}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Scale className="w-5 h-5 text-pink" /> Units of Measurement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {form.units.map((u) => (
              <span key={u} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-3 pr-1.5 py-1 text-sm">
                {u}
                <button onClick={() => removeUnit(u)} className="text-blue-500 hover:text-red-500 rounded-full p-0.5"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add a unit" value={newUnit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit() } }} onChange={(e) => setNewUnit(e.target.value)} />
            <Button variant="outline" onClick={addUnit}><Plus className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Defaults</CardTitle>
          <CardDescription>Default low-stock alert level and markup applied to new products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-2">
              <Label>Low Stock Threshold</Label>
              <Input type="number" min={0} value={form.low_stock_default} onChange={(e) => setForm((p) => ({ ...p, low_stock_default: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Default Markup %</Label>
              <Input type="number" min={0} value={form.default_markup_percentage} onChange={(e) => setForm((p) => ({ ...p, default_markup_percentage: Number(e.target.value) }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-pink" /> Demand Forecast</CardTitle>
          <CardDescription>Knobs for the Libreta Insights forecast and reorder planner</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div className="space-y-2">
              <Label>Lookback Window (days)</Label>
              <Input type="number" min={14} step={1} value={form.window_days} onChange={(e) => setForm((p) => ({ ...p, window_days: Number(e.target.value) }))} />
              <p className="text-xs text-slate-500">Sales history used to estimate daily demand</p>
            </div>
            <div className="space-y-2">
              <Label>Lead Time (days)</Label>
              <Input type="number" min={0} step={1} value={form.lead_time_days} onChange={(e) => setForm((p) => ({ ...p, lead_time_days: Number(e.target.value) }))} />
              <p className="text-xs text-slate-500">Days from order to stock arriving</p>
            </div>
            <div className="space-y-2">
              <Label>Safety Stock (days)</Label>
              <Input type="number" min={0} step={1} value={form.safety_stock_days} onChange={(e) => setForm((p) => ({ ...p, safety_stock_days: Number(e.target.value) }))} />
              <p className="text-xs text-slate-500">Buffer demand the reorder plan holds as cover</p>
            </div>
            <div className="space-y-2">
              <Label>Review Interval (days)</Label>
              <Input type="number" min={1} step={1} value={form.review_interval_days} onChange={(e) => setForm((p) => ({ ...p, review_interval_days: Number(e.target.value) }))} />
              <p className="text-xs text-slate-500">Days before a reorder plan is considered stale</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit (Utang) Settings</CardTitle>
          <CardDescription>Control how customer credit limits are enforced at the POS</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Enforce credit limits (hard block)</Label>
              <p className="text-xs text-slate-500">On: POS blocks a credit sale exceeding the customer's limit. Off: soft warning only.</p>
            </div>
            <Switch checked={form.enforce_credit_limit} onCheckedChange={(c) => setForm((p) => ({ ...p, enforce_credit_limit: c }))} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={resetDefaults}>Restore default categories & units</Button>
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-pink hover:bg-pink/90">
          <Save className="w-4 h-4 mr-2" /> {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
