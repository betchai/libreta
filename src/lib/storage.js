// Supabase Storage helper — converts the Base44 `integrations.Core.UploadFile`
// call into a real upload to the `receipts` bucket.
import { supabase } from '@/api/supabaseClient'

// Upload a receipt image and return its public URL.
export async function uploadReceipt(file) {
  if (window.__DEMO__) return 'https://placehold.co/400x600?text=Demo+Receipt'
  if (!file) return ''
  const safeName = String(file.name || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `receipts/${Date.now()}-${safeName}`
  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: false, cacheControl: '3600' })
  if (error) throw new Error('Receipt upload failed: ' + error.message)
  const { data } = supabase.storage.from('receipts').getPublicUrl(path)
  return data.publicUrl
}
