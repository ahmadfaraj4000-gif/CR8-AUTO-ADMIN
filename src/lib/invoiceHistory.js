import { DRAFT_KEY, loadOrCreateDraft, newInvoice, newLineItem } from './invoiceDraft.js'

export const RECORD_PREFIX = 'cr8InvoiceRecord:'
export const ACTIVE_KEY = 'cr8ActiveInvoice'
export const LEGACY_BACKUP_KEY = 'cr8InvoiceDraft:original-backup'
const clone = (value) => JSON.parse(JSON.stringify(value))
const normalized = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const phone = (value) => String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const cents = (value) => Math.round(Number(value || 0) * 100)

export function sameCustomer(a, b) {
  const aPhone = phone(a.customerPhone || a.phone), bPhone = phone(b.customerPhone || b.phone)
  const aEmail = normalized(a.customerEmail || a.email), bEmail = normalized(b.customerEmail || b.email)
  if (aPhone && bPhone && aPhone === bPhone) return true
  if (aEmail && bEmail && aEmail === bEmail) return true
  // Never match different known contacts on name alone.
  if ((aPhone && bPhone) || (aEmail && bEmail)) return false
  const name = normalized(a.customerName || a.name)
  return !!name && name === normalized(b.customerName || b.name)
}

export function sameVehicle(a, b) {
  const vinA = normalized(a.vin), vinB = normalized(b.vin)
  if (vinA && vinB) return vinA === vinB
  const plateA = normalized(a.plate), plateB = normalized(b.plate)
  if (plateA && plateB) return plateA === plateB
  return !!normalized(a.vehicle) && normalized(a.vehicle) === normalized(b.vehicle)
}

export function invoiceTotals(record) {
  const totals = { partsSubtotal: 0, laborSubtotal: 0, otherSubtotal: 0 }
  for (const item of record.items || []) {
    const key = item.type === 'part' ? 'partsSubtotal' : item.type === 'labor' ? 'laborSubtotal' : 'otherSubtotal'
    totals[key] += Math.round(Number(item.quantity || 0) * cents(item.rate))
  }
  totals.subtotal = totals.partsSubtotal + totals.laborSubtotal + totals.otherSubtotal
  totals.discount = cents(record.invoice.discount)
  const taxable = Math.max(0, totals.subtotal - totals.discount)
  totals.tax = Math.round(taxable * Number(record.invoice.taxRate || 0) / 100)
  totals.total = taxable + totals.tax
  totals.amountPaid = (record.payments || []).filter(p => !p.voidedAt).reduce((sum, p) => sum + cents(p.amount), 0)
  totals.balanceDue = Math.max(0, totals.total - totals.amountPaid)
  totals.credit = Math.max(0, totals.amountPaid - totals.total)
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 100]))
}

export function invoiceStatus(record) {
  if (record.documentType === 'estimate') return 'Estimate'
  const totals = invoiceTotals(record)
  if (totals.amountPaid > 0 && totals.balanceDue > 0) return 'Partially paid'
  if (totals.amountPaid > 0 && totals.balanceDue === 0) return totals.credit ? 'Overpaid' : 'Paid'
  return totals.total > 0 ? 'Unpaid' : 'Draft'
}

export function normalizeRecord(value) {
  if (!value || !value.invoice || !value.invoice.invoiceNumber || !Array.isArray(value.items)) {
    throw new Error('This is not a complete invoice backup. No saved data was replaced.')
  }
  const record = clone(value)
  record.id ||= crypto.randomUUID()
  record.revision ||= crypto.randomUUID()
  record.baseRevision ??= null
  record.documentType = record.documentType === 'estimate' ? 'estimate' : 'invoice'
  record.updatedAt ||= new Date().toISOString()
  if (!Array.isArray(record.payments)) {
    const amount = Number(record.invoice.amountPaid || 0)
    record.payments = amount > 0 ? [{
      id: `legacy-${record.id}`, amount, date: '', method: 'Unknown (legacy)', reference: '',
      note: 'Recovered from the old Amount Paid field. Payment date and method were not recorded.', legacy: true
    }] : []
  }
  record.invoice.amountPaid = String(invoiceTotals(record).amountPaid)
  return record
}

export function readHistory(storage = localStorage) {
  const records = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(RECORD_PREFIX)) {
      try { records.push(normalizeRecord(JSON.parse(storage.getItem(key)))) }
      catch { throw new Error('An invoice in browser storage is unreadable. Export a backup before continuing; the original data has been kept.') }
    }
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function writeRecord(record, storage = localStorage) {
  // Do not erase or replace the old single draft; it remains a recovery source.
  storage.setItem(RECORD_PREFIX + record.id, JSON.stringify(record))
  return record
}

export function initializeHistory(storage = localStorage, now = new Date()) {
  const history = readHistory(storage)
  const active = history.find(record => record.id === storage.getItem(ACTIVE_KEY))
  if (active) return active
  const raw = storage.getItem(DRAFT_KEY)
  if (raw && !storage.getItem(LEGACY_BACKUP_KEY)) storage.setItem(LEGACY_BACKUP_KEY, raw)
  // Parse before calling the legacy loader so corrupt data is never silently replaced.
  if (raw) { const parsed = JSON.parse(raw); if (parsed) normalizeRecord(parsed) }
  const draft = loadOrCreateDraft(storage, now)
  const record = normalizeRecord({ ...draft, dirty: true })
  writeRecord(record, storage)
  storage.setItem(ACTIVE_KEY, record.id)
  return record
}

export function createRecord(previousNumber, storage = localStorage, now = new Date()) {
  const invoice = newInvoice(storage, now, previousNumber)
  // Browser counters alone can collide across computers. Keep the readable sequence and add a unique suffix.
  invoice.invoiceNumber += '-' + crypto.randomUUID().slice(0, 8).toUpperCase()
  return normalizeRecord({ invoice, documentType: 'invoice', items: [newLineItem('part'), newLineItem('labor')], payments: [], dirty: true })
}

export function editRecord(record, changes) {
  const next = normalizeRecord({ ...record, ...changes, revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), dirty: true })
  next.invoice.amountPaid = String(invoiceTotals(next).amountPaid)
  return next
}

export function addPayment(record, payment) {
  const amount = Number(payment.amount)
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new Error('Enter a payment greater than zero with at most two decimal places.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date || '') || !payment.method) throw new Error('Choose the payment date and type.')
  return editRecord(record, { payments: [...record.payments, { ...payment, amount, id: crypto.randomUUID(), recordedAt: new Date().toISOString() }] })
}

export function voidPayment(record, id, reason) {
  if (!reason?.trim()) throw new Error('Enter a reason for voiding this payment.')
  return editRecord(record, { payments: record.payments.map(p => p.id === id && !p.voidedAt ? { ...p, voidedAt: new Date().toISOString(), voidReason: reason.trim() } : p) })
}

export function matchingHistory(history, customer, vehicle) {
  return history.filter(record => sameCustomer(record.invoice, customer) && (!vehicle || sameVehicle(record.invoice, vehicle)))
    .sort((a, b) => (invoiceStatus(b) === 'Partially paid') - (invoiceStatus(a) === 'Partially paid') || b.updatedAt.localeCompare(a.updatedAt))
}

export function importRecords(value, storage = localStorage) {
  const entries = Array.isArray(value?.records) ? value.records : [value]
  if (!entries.length) throw new Error('No invoices were found in this backup.')
  const incoming = entries.map(normalizeRecord)
  const existing = readHistory(storage)
  let count = 0
  for (const record of incoming) {
    const importedVersion = `${record.id}:${record.revision}`
    if (existing.some(old => (old.id === record.id && old.revision === record.revision) || old.importedVersion === importedVersion)) continue
    record.importedVersion = importedVersion
    // A differing version is imported as a separate recovered copy, never over another invoice.
    if (existing.some(old => old.id === record.id)) {
      record.recoveredFrom = record.id
      record.id = crypto.randomUUID()
      record.invoice.invoiceNumber += '-RECOVERED'
    }
    record.baseRevision = null
    record.revision = crypto.randomUUID()
    record.dirty = true
    writeRecord(record, storage)
    existing.push(record)
    count++
  }
  return count
}
