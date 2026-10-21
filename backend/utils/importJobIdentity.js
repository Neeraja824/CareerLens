import { createHash } from 'node:crypto'

function normalizeText(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function normalizeSourceUrl(value) {
  const url = new URL(value.trim())
  url.hash = ''
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }
  return url.toString()
}

export function createImportKey(job) {
  let identity
  let prefix
  if (job.sourceListingId) {
    prefix = 'external'
    identity = [normalizeText(job.sourceName), job.sourceListingId.trim()]
  } else {
    prefix = 'listing'
    identity = [
      normalizeText(job.companyName),
      normalizeText(job.title),
      normalizeSourceUrl(job.sourceUrl),
    ]
  }

  const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  return `${prefix}:${digest}`
}
