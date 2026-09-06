// Discount types and computation helpers (ported verbatim from Base44 app).

export const DISCOUNT_TYPES = {
  NONE: 'none',
  SENIOR_CITIZEN: 'senior_citizen',
  PWD: 'pwd',
  CUSTOM_PERCENT: 'custom_percent',
  CUSTOM_AMOUNT: 'custom_amount',
}

export const SC_PWD_RATE = 0.2

export const DISCOUNT_LABELS = {
  none: 'None',
  senior_citizen: 'Senior Citizen (20%)',
  pwd: 'PWD (20%)',
  custom_percent: 'Custom %',
  custom_amount: 'Custom Amount',
}

export const DISCOUNT_SHORT_LABELS = {
  none: '',
  senior_citizen: 'SC 20%',
  pwd: 'PWD 20%',
  custom_percent: 'Custom %',
  custom_amount: 'Custom ₱',
}

export function isStatutory(type) {
  return type === DISCOUNT_TYPES.SENIOR_CITIZEN || type === DISCOUNT_TYPES.PWD
}

export function isCustom(type) {
  return type === DISCOUNT_TYPES.CUSTOM_PERCENT || type === DISCOUNT_TYPES.CUSTOM_AMOUNT
}

export function computeLineDiscount(item) {
  const gross = (Number(item.price_at_sale) || 0) * (Number(item.quantity) || 0)
  const type = item.discount_type || DISCOUNT_TYPES.NONE
  let discount = 0
  if (type === DISCOUNT_TYPES.SENIOR_CITIZEN || type === DISCOUNT_TYPES.PWD) {
    discount = gross * SC_PWD_RATE
  } else if (type === DISCOUNT_TYPES.CUSTOM_PERCENT) {
    const pct = Math.max(0, Number(item.discount_value) || 0)
    discount = gross * (pct / 100)
  } else if (type === DISCOUNT_TYPES.CUSTOM_AMOUNT) {
    discount = Math.max(0, Number(item.discount_value) || 0)
  }
  discount = Math.min(discount, gross)
  discount = Math.round(discount * 100) / 100
  return { discount_amount: discount, net_amount: Math.round((gross - discount) * 100) / 100 }
}

export function validateLineDiscount(item) {
  const errors = []
  const type = item.discount_type || DISCOUNT_TYPES.NONE
  if (type === DISCOUNT_TYPES.NONE) return { valid: true, errors: [] }

  if (isStatutory(type)) {
    if (!item.discount_id_number || !String(item.discount_id_number).trim()) {
      errors.push('ID number is required for Senior Citizen / PWD discounts.')
    }
    if (!item.discount_person_name || !String(item.discount_person_name).trim()) {
      errors.push('Qualified person name is required for Senior Citizen / PWD discounts.')
    }
  }
  if (isCustom(type)) {
    if (!item.discount_reason || !String(item.discount_reason).trim()) {
      errors.push('A reason is required for custom discounts.')
    }
    if (type === DISCOUNT_TYPES.CUSTOM_PERCENT) {
      const pct = Number(item.discount_value) || 0
      if (pct <= 0 || pct > 100) errors.push('Custom % must be between 0.01 and 100.')
    }
    if (type === DISCOUNT_TYPES.CUSTOM_AMOUNT) {
      const amt = Number(item.discount_value) || 0
      if (amt <= 0) errors.push('Custom amount must be greater than 0.')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validateCartDiscounts(items) {
  const allErrors = []
  let firstError = ''
  for (const item of items) {
    const { valid, errors } = validateLineDiscount(item)
    if (!valid) {
      allErrors.push(...errors)
      if (!firstError) firstError = errors[0]
    }
  }
  return { valid: allErrors.length === 0, errors: allErrors, firstError }
}

export function summarizeSaleDiscounts(items) {
  let gross = 0, totalDiscount = 0, scPwd = 0, other = 0
  ;(items || []).forEach((item) => {
    const grossLine = (Number(item.price_at_sale) || 0) * (Number(item.quantity) || 0)
    gross += grossLine
    const { discount_amount } = computeLineDiscount(item)
    totalDiscount += discount_amount
    if (isStatutory(item.discount_type)) scPwd += discount_amount
    if (isCustom(item.discount_type)) other += discount_amount
  })
  return {
    gross_amount: Math.round(gross * 100) / 100,
    total_discount_amount: Math.round(totalDiscount * 100) / 100,
    sc_pwd_discount_amount: Math.round(scPwd * 100) / 100,
    other_discount_amount: Math.round(other * 100) / 100,
    net_total: Math.round((gross - totalDiscount) * 100) / 100,
  }
}
