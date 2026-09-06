// Field-level, previewable CSV 
import { base44 } from '@/api/base44Client'
export const STOCK_MODES = { SET: 'set', ADD: 'add', SKIP: 'skip' }
export const STOCK_MODE_LABELS = {
  [STOCK_MODES.SET]: 'Set stock to this value',
  [STOCK_MODES.ADD]: 'Add this value to current stock',
  [STOCK_MODES.SKIP]: 'Do not update stock',
}
export const CLEAR_MARKER = '<clear>'

export const COLUMNS = [
  { key: 'name', label: 'name', type: 'string', required: true },
  { key: 'sku', label: 'sku', type: 'string', required: false },
  { key: 'barcode', label: 'barcode', type: 'string', required: false },
  { key: 'category', label: 'category', type: 'string', required: true },
  { key: 'base_unit', label: 'base_unit', type: 'string', required: true },
  { key: 'cost_price', label: 'cost_price', type: 'number', required: false },
  { key: 'base_price', label: 'base_price', type: 'number', required: true },
  { key: 'markup_percentage', label: 'markup_percentage', type: 'number', required: false },
  { key: 'has_fractions', label: 'has_fractions', type: 'boolean', required: false },
  { key: 'fraction_unit', label: 'fraction_unit', type: 'string', required: false },
  { key: 'fraction_multiplier', label: 'fraction_multiplier', type: 'number', required: false },
  { key: 'fraction_price', label: 'fraction_price', type: 'number', required: false },
  { key: 'sell_by_weight', label: 'sell_by_weight', type: 'boolean', required: false },
  { key: 'stock_quantity', label: 'stock_quantity', type: 'number', required: false },
  { key: 'low_stock_threshold', label: 'low_stock_threshold', type: 'number', required: false },
  { key: 'vat_exempt', label: 'vat_exempt', type: 'boolean', required: false },
  { key: 'image_url', label: 'image_url', type: 'string', required: false },
]

const EXAMPLE_ROW = {
  name: 'hog grower feed', sku: 'FEED-001', barcode: '4801234500011', category: 'Feed',
  base_unit: 'Sack', cost_price: '1100', base_price: '1350', has_fractions: 'true',
  fraction_unit: 'Kg', fraction_multiplier: '50', fraction_price: '30',
  stock_quantity: '20', low_stock_threshold: '5', vat_exempt: 'false',
}

export function downloadTemplate() {
  const header = COLUMNS.map((c) => c.label).join(',')
  const example = COLUMNS.map((c) => EXAMPLE_ROW[c.key] ?? '').join(',')
  const guide =
    '# Inventory Import Template — Libreta\n' +
    '# RULES:\n' +
    '#   - Leave a cell BLANK to keep the existing value unchanged (field-level merge).\n' +
    '#   - To explicitly clear a field, type <clear> in that cell.\n' +
    '#   - stock_quantity behavior is chosen at import time (Set / Add / Skip), not in this file.\n' +
    '#   - Matching priority for existing products: SKU -> barcode -> name (case-insensitive).\n' +
    '#\n' +
    '# REQUIRED for NEW products: name, sku, category, base_unit, base_price.\n'
  const csv = guide + header + '\n' + example + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'libreta_product_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (inQuotes) {
      if (char === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += char }
    } else {
      if (char === '"') inQuotes = true
      else if (char === ',') { row.push(field); field = '' }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (char !== '\r') { field += char }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function extractDataRows(allRows) {
  const dataRows = allRows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === '') && !r[0].startsWith('#'))
  if (dataRows.length < 1) return { headers: [], body: [] }
  const headers = dataRows[0].map((h) => h.trim())
  return { headers, body: dataRows.slice(1) }
}

function parseRow(row, headers) {
  const obj = {}
  headers.forEach((h, idx) => {
    const col = COLUMNS.find((c) => c.key === h)
    if (!col) return
    obj[col.key] = (row[idx] ?? '').trim()
  })
  return obj
}

function coerceValue(col, raw) {
  if (raw === CLEAR_MARKER) {
    if (col.type === 'boolean') return false
    if (col.type === 'number') return 0
    return ''
  }
  if (col.type === 'number') return Number(raw)
  if (col.type === 'boolean') return raw.toLowerCase() === 'true' || raw === '1'
  return raw
}

function valuesDiffer(oldVal, newVal) {
  const o = oldVal ?? ''
  const n = newVal ?? ''
  if (typeof o === 'number' || typeof n === 'number') return Number(o) !== Number(n)
  return String(o) !== String(n)
}

export function validateRow(rawObj, isCreate, validCategories) {
  const errors = []
  if (!rawObj.name) errors.push('missing required field: name')
  if (rawObj.category) {
    if (validCategories.length > 0 && !validCategories.includes(rawObj.category)) errors.push(`unknown category "${rawObj.category}"`)
  } else if (isCreate) errors.push('missing required field: category')
  if (isCreate && !rawObj.base_unit) errors.push('missing required field: base_unit')
  if (isCreate) {
    if (rawObj.base_price === '') {
      if (rawObj.cost_price === '') errors.push('missing required field: base_price (or cost_price to auto-suggest)')
    } else if (isNaN(Number(rawObj.base_price))) errors.push('invalid base_price: not a number')
  } else if (rawObj.base_price !== '' && isNaN(Number(rawObj.base_price))) errors.push('invalid base_price: not a number')
  if (rawObj.cost_price !== '' && rawObj.cost_price !== undefined && isNaN(Number(rawObj.cost_price))) errors.push('invalid cost_price: not a number')
  if (rawObj.stock_quantity !== '' && rawObj.stock_quantity !== undefined && isNaN(Number(rawObj.stock_quantity))) errors.push('invalid stock_quantity: not a number')
  ;['fraction_multiplier', 'fraction_price', 'low_stock_threshold', 'markup_percentage'].forEach((k) => {
    if (rawObj[k] !== '' && rawObj[k] !== undefined && isNaN(Number(rawObj[k]))) errors.push(`invalid ${k}: not a number`)
  })
  return errors
}

const norm = (v) => (v ?? '').toString().trim().toLowerCase()

function buildMatchMaps(existing) {
  const bySku = new Map(); const byBarcode = new Map(); const byName = new Map()
  existing.forEach((p) => {
    if (p.sku) bySku.set(norm(p.sku), p)
    if (p.barcode) byBarcode.set(norm(p.barcode), p)
    byName.set(norm(p.name), p)
  })
  return { bySku, byBarcode, byName }
}

function matchProduct(rawObj, maps) {
  return (rawObj.sku && maps.bySku.get(norm(rawObj.sku)))
    || (rawObj.barcode && maps.byBarcode.get(norm(rawObj.barcode)))
    || (rawObj.name && maps.byName.get(norm(rawObj.name)))
    || null
}

function computeUpdate(rawObj, existing, settings, stockMode) {
  const changes = {}
  const fieldDiffs = []
  COLUMNS.forEach((col) => {
    if (col.key === 'stock_quantity') return
    const raw = rawObj[col.key]
    if (raw === '' || raw === undefined) return
    const newVal = coerceValue(col, raw)
    if (valuesDiffer(existing[col.key], newVal)) {
      changes[col.key] = newVal
      fieldDiffs.push({ field: col.key, old: String(existing[col.key] ?? ''), new: String(newVal) })
    }
  })
  let stockDelta = 0
  const stockRaw = rawObj.stock_quantity
  if (stockRaw !== '' && stockRaw !== undefined && stockMode !== STOCK_MODES.SKIP) {
    const csvStock = Number(stockRaw)
    if (!isNaN(csvStock)) {
      const oldStock = Number(existing.stock_quantity) || 0
      let newStock
      if (stockMode === STOCK_MODES.SET) newStock = csvStock
      else if (stockMode === STOCK_MODES.ADD) newStock = oldStock + csvStock
      if (newStock !== undefined && newStock !== oldStock) {
        changes.stock_quantity = newStock
        fieldDiffs.push({ field: 'stock_quantity', old: String(oldStock), new: String(newStock) })
        stockDelta = newStock - oldStock
      }
    }
  }
  return { changes, fieldDiffs, stockDelta }
}

function buildCreate(rawObj, settings, stockMode, tenantId) {
  const data = { tenant_id: tenantId }
  COLUMNS.forEach((col) => {
    if (col.key === 'stock_quantity') return
    const raw = rawObj[col.key]
    if (raw === '' || raw === undefined) return
    data[col.key] = coerceValue(col, raw)
  })
  if (data.low_stock_threshold === undefined) data.low_stock_threshold = settings.low_stock_default ?? 5
  if (data.markup_percentage === undefined) data.markup_percentage = settings.default_markup_percentage ?? 20
  if (data.cost_price === undefined) data.cost_price = 0
  if (data.has_fractions === undefined) data.has_fractions = false
  if (data.vat_exempt === undefined) data.vat_exempt = false
  if (data.sell_by_weight === undefined) data.sell_by_weight = false
  if ((data.base_price === undefined || data.base_price === 0) && data.cost_price) {
    data.base_price = Number((data.cost_price * (1 + (data.markup_percentage || 0) / 100)).toFixed(2))
  }
  let stockDelta = 0
  const stockRaw = rawObj.stock_quantity
  if (stockMode !== STOCK_MODES.SKIP && stockRaw !== '' && stockRaw !== undefined) {
    const csvStock = Number(stockRaw)
    if (!isNaN(csvStock)) { data.stock_quantity = csvStock; stockDelta = csvStock }
  }
  if (data.stock_quantity === undefined) data.stock_quantity = 0
  return { data, stockDelta }
}

export function buildPreview(csvRows, headers, existingProducts, settings, stockMode) {
  const maps = buildMatchMaps(existingProducts)
  const creates = []; const updates = []; const errors = []
  csvRows.forEach((r, idx) => {
    if (r.length === 1 && r[0] === '') return
    const rawObj = parseRow(r, headers)
    const matched = matchProduct(rawObj, maps)
    const isCreate = !matched
    const rowErrors = validateRow(rawObj, isCreate, settings.categories || [])
    if (rowErrors.length) { errors.push({ index: idx + 2, rawObj, errors: rowErrors }); return }
    if (matched) {
      const { changes, fieldDiffs, stockDelta } = computeUpdate(rawObj, matched, settings, stockMode)
      updates.push({ index: idx + 2, existing: matched, rawObj, changes, fieldDiffs, stockDelta, noChange: Object.keys(changes).length === 0 })
    } else {
      const { data, stockDelta } = buildCreate(rawObj, settings, stockMode, existingProducts[0]?.tenant_id)
      creates.push({ index: idx + 2, data, stockDelta, rawObj })
    }
  })
  return { creates, updates, errors }
}

export async function executeImport(preview, stockMode, tenantId, user, filename) {
  const { creates, updates, errors } = preview
  const userName = user?.full_name || user?.email || user?.id || 'unknown'
  const now = new Date().toISOString()
  const batch = await base44.entities.ImportBatch.create({
    date: now, uploaded_by: userName, filename: filename || '', stock_mode_used: stockMode,
    products_created_count: creates.length,
    products_updated_count: updates.filter((u) => !u.noChange).length,
    rows_skipped_count: errors.length, status: 'completed', tenant_id: tenantId,
  })
  const changeLogs = []; const stockMovements = []
  let createdRecords = []
  if (creates.length > 0) {
    createdRecords = await base44.entities.Product.bulkCreate(creates.map((c) => ({ ...c.data, tenant_id: tenantId })))
    creates.forEach((c, i) => {
      const rec = createdRecords[i]
      const fieldChanges = Object.entries(c.data).filter(([k]) => k !== 'tenant_id').map(([field, val]) => ({ field, old_value: '', new_value: String(val) }))
      if (c.stockDelta !== 0) {
        stockMovements.push({ product_id: rec.id, product_name: rec.name, quantity: Math.abs(c.stockDelta), direction: c.stockDelta >= 0 ? 'in' : 'out', reason: 'csv_import', reference_id: batch.id, recorded_by: userName, tenant_id: tenantId })
      }
      changeLogs.push({ batch_id: batch.id, product_id: rec.id, product_name: rec.name, action: 'created', field_changes: fieldChanges, stock_delta: c.stockDelta, tenant_id: tenantId })
    })
  }
  const toUpdate = updates.filter((u) => !u.noChange)
  if (toUpdate.length > 0) {
    await base44.entities.Product.bulkUpdate(toUpdate.map((u) => ({ id: u.existing.id, ...u.changes })))
    toUpdate.forEach((u) => {
      if (u.stockDelta !== 0) stockMovements.push({ product_id: u.existing.id, product_name: u.existing.name, quantity: Math.abs(u.stockDelta), direction: u.stockDelta >= 0 ? 'in' : 'out', reason: 'csv_import', reference_id: batch.id, recorded_by: userName, tenant_id: tenantId })
      changeLogs.push({ batch_id: batch.id, product_id: u.existing.id, product_name: u.existing.name, action: 'updated', field_changes: u.fieldDiffs.map((d) => ({ field: d.field, old_value: d.old, new_value: d.new })), stock_delta: u.stockDelta, tenant_id: tenantId })
    })
  }
  let movementRecords = []
  if (stockMovements.length > 0) movementRecords = await base44.entities.StockMovement.bulkCreate(stockMovements)
  let mi = 0
  changeLogs.forEach((cl) => {
    if (cl.stock_delta !== 0 && movementRecords[mi]) { cl.stock_movement_id = movementRecords[mi].id; mi++ }
  })
  if (changeLogs.length > 0) await base44.entities.ImportChangeLog.bulkCreate(changeLogs)
  return { batchId: batch.id, created: creates.length, updated: toUpdate.length, skipped: errors.length }
}

export async function undoBatch(batchId, tenantId, user, { deleteCreatedProducts }) {
  const userName = user?.full_name || user?.email || user?.id || 'unknown'
  const [batch, changeLogs] = await Promise.all([
    base44.entities.ImportBatch.get(batchId),
    base44.entities.ImportChangeLog.filter({ batch_id: batchId }),
  ])
  if (batch.status === 'undone') throw new Error('This batch has already been undone.')
  const productIds = [...new Set(changeLogs.map((cl) => cl.product_id))]
  const currentProducts = productIds.length > 0 ? await base44.entities.Product.filter({ id: { $in: productIds } }) : []
  const productMap = new Map(currentProducts.map((p) => [p.id, p]))
  const counterMovements = []; const productUpdates = []; const productDeletions = []
  changeLogs.forEach((cl) => {
    if (cl.action === 'created') { if (deleteCreatedProducts && productMap.has(cl.product_id)) productDeletions.push(cl.product_id); return }
    const p = productMap.get(cl.product_id)
    if (!p) return
    const revert = { id: cl.product_id }
    ;(cl.field_changes || []).forEach((fc) => {
      if (String(p[fc.field] ?? '') === String(fc.new_value)) revert[fc.field] = fc.old_value === '' ? undefined : fc.old_value
    })
    if (cl.stock_delta && cl.stock_delta !== 0) {
      const reverseDelta = -cl.stock_delta
      counterMovements.push({ product_id: cl.product_id, product_name: cl.product_name, quantity: Math.abs(reverseDelta), direction: reverseDelta >= 0 ? 'in' : 'out', reason: 'manual_adjustment', reference_id: batchId, recorded_by: userName, tenant_id: tenantId })
      revert.stock_quantity = (Number(p.stock_quantity) || 0) + reverseDelta
    }
    if (Object.keys(revert).length > 1) productUpdates.push(revert)
  })
  if (productUpdates.length > 0) await base44.entities.Product.bulkUpdate(productUpdates)
  if (counterMovements.length > 0) await base44.entities.StockMovement.bulkCreate(counterMovements)
  for (const id of productDeletions) { try { await base44.entities.Product.delete(id) } catch (e) { /* already deleted */ } }
  await base44.entities.ImportBatch.update(batchId, { status: 'undone', undone_at: new Date().toISOString(), undone_by: userName })
  return { revertedFields: productUpdates.length, reversedStock: counterMovements.length, deletedProducts: productDeletions.length }
}
