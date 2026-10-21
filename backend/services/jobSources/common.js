export function requireHttpsUrl(value, fieldName) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${fieldName} must be a valid HTTPS URL.`)
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error(`${fieldName} must be a valid HTTPS URL.`)
  }
  return url.toString()
}

export function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is missing from the source response.`)
  }
  return value.trim()
}

export function descriptionText(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sourceDate(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    const timestampMatch = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const match = timestampMatch || dateOnlyMatch
    if (!match) return undefined

    const [, year, month, day] = match
    const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    if (
      Number(month) < 1
      || Number(month) > 12
      || Number(day) < 1
      || Number(day) > daysInMonth
    ) {
      return undefined
    }
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function sourceSalary(value) {
  if (!value || typeof value !== 'object') return undefined
  const readAmount = (amount) => {
    if (typeof amount === 'number') return amount
    if (typeof amount === 'string' && amount.trim()) return Number(amount)
    return Number.NaN
  }
  const min = readAmount(value.min)
  const max = readAmount(value.max)
  const currency = typeof value.currency === 'string' ? value.currency.trim() : ''
  const intervalMap = {
    hourly: 'hour',
    'per-hour': 'hour',
    daily: 'day',
    'per-day': 'day',
    weekly: 'week',
    'per-week': 'week',
    monthly: 'month',
    'per-month': 'month',
    yearly: 'year',
    annual: 'year',
    'per-year': 'year',
  }
  const interval = intervalMap[String(value.interval || '').toLowerCase()]

  if (
    !Number.isFinite(min)
    || !Number.isFinite(max)
    || min < 0
    || max < min
    || !/^[A-Z]{3}$/i.test(currency)
    || !interval
  ) {
    return undefined
  }

  return { min, max, currency: currency.toUpperCase(), interval }
}

export async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    throw new Error(`Official job source returned HTTP ${response.status}.`)
  }
  return response.json()
}
