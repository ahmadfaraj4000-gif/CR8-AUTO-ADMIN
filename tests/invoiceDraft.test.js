import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_KEY, todayISO, formatInvoiceDate, loadOrCreateDraft, newInvoice, refreshInvoiceDate } from '../src/lib/invoiceDraft.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  }
}

const today = new Date(2026, 9, 15, 12)

test('reopening a draft preserves its number; starting a new invoice advances it', () => {
  const storage = memoryStorage()
  const first = loadOrCreateDraft(storage, today)
  assert.equal(first.invoice.invoiceNumber, 'CR8-2026-00001')
  assert.deepEqual(loadOrCreateDraft(storage, today), first)
  const second = newInvoice(storage, today, first.invoice.invoiceNumber)
  assert.equal(second.invoiceNumber, 'CR8-2026-00002')
  storage.removeItem(DRAFT_KEY)
  assert.equal(loadOrCreateDraft(storage, today).invoice.invoiceNumber, 'CR8-2026-00003')
})

test('an existing draft keeps customer, items, and number when its date updates', () => {
  const storage = memoryStorage()
  storage.setItem(DRAFT_KEY, JSON.stringify({
    documentType: 'estimate',
    invoice: { invoiceNumber: 'CR8-2026-90812', invoiceDate: '2026-10-14', dueDate: '2026-10-14', customerName: 'Test customer', amountPaid: '50' },
    items: [{ id: 'part', quantity: 2, rate: '125' }]
  }))
  const draft = loadOrCreateDraft(storage, today)
  assert.equal(draft.invoice.invoiceNumber, 'CR8-2026-90812')
  assert.equal(draft.invoice.invoiceDate, '2026-10-15')
  assert.equal(draft.invoice.dueDate, '2026-10-15')
  assert.equal(draft.invoice.customerName, 'Test customer')
  assert.equal(draft.invoice.amountPaid, '50')
  assert.equal(draft.documentType, 'estimate')
  assert.equal(draft.items[0].rate, '125')
  assert.equal(newInvoice(storage, today, draft.invoice.invoiceNumber).invoiceNumber, 'CR8-2026-90813')
})

test('new numbers remain increasing after reload, with separate counters by year', () => {
  const storage = memoryStorage()
  storage.setItem('cr8InvoiceSequence:2026', '99999')
  assert.equal(newInvoice(storage, today, 'CR8-2026-00001').invoiceNumber, 'CR8-2026-100000')
  assert.equal(newInvoice(storage, new Date(2027, 0, 1), 'CR8-2026-100000').invoiceNumber, 'CR8-2027-00001')
})

test('local dates and printed dates do not shift across UTC midnight', () => {
  assert.equal(todayISO(new Date(2026, 9, 15, 0, 1)), '2026-10-15')
  assert.equal(todayISO(new Date(2026, 9, 15, 23, 59)), '2026-10-15')
  assert.equal(formatInvoiceDate('2026-10-15'), new Date(2026, 9, 15).toLocaleDateString())
  assert.equal(formatInvoiceDate(''), '—')
})

test('midnight refresh preserves custom due dates, numbers, and customer data', () => {
  const invoice = { invoiceNumber: 'CR8-2026-00010', invoiceDate: '2026-10-14', dueDate: '2026-11-01', customerName: 'Test customer' }
  const updated = refreshInvoiceDate(invoice, today)
  assert.deepEqual(updated, { ...invoice, invoiceDate: '2026-10-15' })
  assert.equal(refreshInvoiceDate(updated, today), updated)
})

test('empty charge lists survive reload; unreadable drafts get a new number', () => {
  const storage = memoryStorage()
  const draft = loadOrCreateDraft(storage, today)
  storage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, items: [] }))
  assert.deepEqual(loadOrCreateDraft(storage, today).items, [])
  storage.setItem(DRAFT_KEY, '{invalid')
  assert.equal(loadOrCreateDraft(storage, today).invoice.invoiceNumber, 'CR8-2026-00002')
})
