import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_KEY } from '../src/lib/invoiceDraft.js'
import { ACTIVE_KEY, LEGACY_BACKUP_KEY, RECORD_PREFIX, normalizeRecord, initializeHistory, readHistory, writeRecord, createRecord, editRecord, addPayment, voidPayment, invoiceTotals, invoiceStatus, matchingHistory, importRecords, sameCustomer, sameVehicle } from '../src/lib/invoiceHistory.js'
import { syncRecord, fetchCloudInvoices, mergeCloudRecords, cloudError } from '../src/lib/invoiceSync.js'

function storage() {
  const data = new Map()
  return { get length() { return data.size }, key: i => [...data.keys()][i], getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }
}
function invoice(changes = {}) {
  return normalizeRecord({ invoice: { invoiceNumber: 'CR8-2026-00010', invoiceDate: '2026-09-01', dueDate: '2026-09-10', customerName: 'Test Customer', customerPhone: '5185550100', vehicle: '2018 Test Car', vin: 'TEST-VIN-A', taxRate: '8', amountPaid: '50' }, items: [{ id: 'part', type: 'part', description: 'Repair', quantity: 2, rate: '100' }], ...changes })
}

test('migrates and backs up the old draft once, preserving exact dates, pricing and legacy paid amount', () => {
  const db = storage()
  const legacy = { invoice: invoice().invoice, items: invoice().items, documentType: 'invoice' }
  const raw = JSON.stringify(legacy)
  db.setItem(DRAFT_KEY, raw)
  const record = initializeHistory(db, new Date(2026, 10, 10))
  assert.equal(db.getItem(LEGACY_BACKUP_KEY), raw)
  assert.equal(record.invoice.invoiceDate, '2026-09-01')
  assert.equal(record.invoice.dueDate, '2026-09-10')
  assert.equal(record.payments.length, 1)
  assert.equal(record.payments[0].amount, 50)
  assert.equal(record.payments[0].method, 'Unknown (legacy)')
  assert.equal(record.payments[0].date, '')
  assert.equal(invoiceTotals(record).balanceDue, 166)
  assert.equal(initializeHistory(db).id, record.id)
  assert.equal(readHistory(db).length, 1)
  assert.equal(initializeHistory(db).payments.length, 1)
})

test('starting and recalling documents retains all original charges and payments without changing dates', () => {
  const db = storage()
  const old = invoice()
  writeRecord(old, db)
  const next = createRecord(old.invoice.invoiceNumber, db)
  writeRecord(next, db)
  db.setItem(ACTIVE_KEY, next.id)
  assert.equal(readHistory(db).length, 2)
  assert.equal(invoiceTotals(next).amountPaid, 0)
  assert.equal(invoiceTotals(next).total, 0)
  db.setItem(ACTIVE_KEY, old.id)
  assert.deepEqual(initializeHistory(db), old)
})

test('new invoice numbers cannot collide merely because browser counters match', () => {
  const a = createRecord('', storage()), b = createRecord('', storage())
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.invoice.invoiceNumber, b.invoice.invoiceNumber)
})

test('payments accumulate once, retain their types and references and survive reload', () => {
  const db = storage()
  const first = addPayment(invoice(), { amount: '66.00', date: '2026-11-10', method: 'Cash', reference: 'receipt A' })
  const final = addPayment(first, { amount: '100.00', date: '2026-11-10', method: 'Card', reference: 'receipt B' })
  writeRecord(final, db)
  const saved = readHistory(db)[0]
  assert.equal(saved.payments.length, 3)
  assert.equal(saved.payments[2].method, 'Card')
  assert.equal(saved.payments[2].reference, 'receipt B')
  assert.equal(invoiceTotals(saved).amountPaid, 216)
  assert.equal(invoiceTotals(saved).balanceDue, 0)
  assert.equal(invoiceStatus(saved), 'Paid')
  assert.equal(saved.invoice.invoiceDate, '2026-09-01')
})

test('voiding a payment retains its audit details and restores the balance', () => {
  const old = invoice()
  assert.throws(() => voidPayment(old, old.payments[0].id, ''), /reason/)
  const next = voidPayment(old, old.payments[0].id, 'Duplicate entry')
  assert.equal(next.payments.length, 1)
  assert.equal(next.payments[0].voidReason, 'Duplicate entry')
  assert.equal(invoiceTotals(next).amountPaid, 0)
  assert.equal(invoiceTotals(next).balanceDue, 216)
  assert.equal(invoiceStatus(next), 'Unpaid')
  assert.equal(invoiceTotals(old).amountPaid, 50)
})

test('rejects negative, zero, invalid and fractional-cent payments', () => {
  for (const amount of ['-1', '0', 'abc', '1.001', Infinity]) {
    assert.throws(() => addPayment(invoice(), { amount, date: '2026-11-10', method: 'Cash' }), /payment/)
  }
  assert.throws(() => addPayment(invoice(), { amount: '2', date: '', method: 'Cash' }), /date/)
})

test('rounds charges and tax to cents and explicitly reports overpayment', () => {
  const record = invoice({ items: [{ type: 'labor', quantity: 1.5, rate: '10.01' }], payments: [{ amount: 20 }] })
  assert.equal(invoiceTotals(record).subtotal, 15.02)
  assert.equal(invoiceTotals(record).tax, 1.2)
  assert.equal(invoiceTotals(record).total, 16.22)
  assert.equal(invoiceTotals(record).credit, 3.78)
  assert.equal(invoiceStatus(record), 'Overpaid')
})

test('customer and vehicle matching uses identifiers and prioritizes partially paid invoices', () => {
  const partial = invoice({ updatedAt: '2026-09-01' })
  const paid = invoice({ payments: [{ amount: 216 }], updatedAt: '2026-11-10' })
  const different = invoice()
  different.invoice.vin = 'TEST-VIN-B'
  const matches = matchingHistory([paid, different, partial], { name: 'Test Customer', phone: '+1 (518) 555-0100' }, partial.invoice)
  assert.deepEqual(matches.map(r => r.id), [partial.id, paid.id])
  assert.equal(sameCustomer({ name: 'John', phone: '111' }, { name: 'John', phone: '222' }), false)
  assert.equal(sameVehicle({ vehicle: 'Same model', vin: 'A' }, { vehicle: 'Same model', vin: 'B' }), false)
})

test('backup import is repeatable and preserves conflicting versions separately', () => {
  const db = storage(), old = invoice()
  writeRecord(old, db)
  assert.equal(importRecords({ records: [old] }, db), 0)
  const changed = editRecord(old, { items: [] })
  assert.equal(importRecords({ records: [changed] }, db), 1)
  assert.equal(importRecords({ records: [changed] }, db), 0)
  const records = readHistory(db)
  assert.equal(records.length, 2)
  assert.equal(records.find(r => r.id === old.id).items.length, 1)
  assert.ok(records.find(r => r.id !== old.id).invoice.invoiceNumber.endsWith('-RECOVERED'))
})

test('corrupt legacy and history data are preserved instead of overwritten', () => {
  const db = storage()
  db.setItem(DRAFT_KEY, '{broken')
  assert.throws(() => initializeHistory(db))
  assert.equal(db.getItem(DRAFT_KEY), '{broken')
  assert.equal(db.getItem(LEGACY_BACKUP_KEY), '{broken')
  db.setItem(RECORD_PREFIX + 'broken', '{invalid')
  assert.throws(() => readHistory(db), /unreadable/)
  assert.equal(db.getItem(RECORD_PREFIX + 'broken'), '{invalid')
})

test('remote refresh cannot overwrite unsynced local payments', () => {
  const db = storage(), local = { ...invoice(), dirty: true }
  writeRecord(local, db)
  const remote = { ...local, payments: [], dirty: false, revision: 'remote' }
  mergeCloudRecords([remote], db)
  assert.equal(readHistory(db)[0].payments.length, 1)
  assert.equal(readHistory(db)[0].revision, local.revision)
})

function fakeClient({ saveData, saveError = null, remoteRevision = null, onSave = () => {} }) {
  const filters = []
  return { filters, from() {
    let mutation = false
    const query = {
      insert() { mutation = true; filters.push(['insert']); return query },
      update() { mutation = true; filters.push(['update']); return query },
      eq(key, value) { filters.push([key, value]); return query },
      select() { return query },
      async maybeSingle() { if (mutation) { onSave(); return { data: saveData, error: saveError } } return { data: remoteRevision ? { revision: remoteRevision } : null, error: null } }
    }
    return query
  } }
}

test('cloud save uses an expected revision and acknowledges only the saved revision', async () => {
  const db = storage(), old = { ...invoice(), dirty: true, baseRevision: 'prior' }
  writeRecord(old, db)
  const client = fakeClient({ saveData: { revision: old.revision }, onSave: () => writeRecord(editRecord(old, { items: [] }), db) })
  await syncRecord(client, old, db)
  assert.ok(client.filters.some(([key, value]) => key === 'revision' && value === 'prior'))
  const saved = readHistory(db)[0]
  assert.equal(saved.baseRevision, old.revision)
  assert.equal(saved.dirty, true)
  assert.equal(saved.items.length, 0)
})

test('a concurrent cloud edit is reported without overwriting local payment history', async () => {
  const db = storage(), old = { ...invoice(), dirty: true, baseRevision: 'prior' }
  writeRecord(old, db)
  const client = fakeClient({ saveData: null, remoteRevision: 'different' })
  await assert.rejects(syncRecord(client, old, db), /another device/)
  assert.equal(readHistory(db)[0].dirty, true)
  assert.equal(invoiceTotals(readHistory(db)[0]).amountPaid, 50)
})

test('retry after a lost save response does not create duplicate payments', async () => {
  const db = storage(), old = { ...invoice(), dirty: true }
  writeRecord(old, db)
  const client = fakeClient({ saveData: null, saveError: { message: 'duplicate key' }, remoteRevision: old.revision })
  await syncRecord(client, old, db)
  assert.equal(readHistory(db)[0].dirty, false)
  assert.equal(readHistory(db)[0].payments.length, 1)
})

test('network failures keep unsynced invoices and missing-table errors explain local-only storage', async () => {
  const db = storage(), old = { ...invoice(), dirty: true }
  writeRecord(old, db)
  const client = fakeClient({ saveData: null, saveError: new Error('Offline') })
  await assert.rejects(syncRecord(client, old, db), /Offline/)
  assert.equal(readHistory(db)[0].dirty, true)
  assert.match(cloudError({ code: 'PGRST205' }), /only in this browser/)
})

test('history fetch paginates instead of silently hiding older invoices', async () => {
  const offsets = []
  const sample = invoice()
  const client = { from() { const query = { select() { return query }, order() { return query }, range(start, end) { offsets.push([start, end]); return Promise.resolve({ data: Array.from({ length: start === 0 ? 500 : 2 }, (_, i) => ({ id: `${start + i}`, revision: 'v1', document: sample })), error: null }) } }; return query } }
  assert.equal((await fetchCloudInvoices(client)).length, 502)
  assert.deepEqual(offsets, [[0, 499], [500, 999]])
})
