import { RECORD_PREFIX, readHistory, writeRecord, normalizeRecord } from './invoiceHistory.js'

export function cloudError(error) {
  if (error?.code === '42P01' || error?.code === 'PGRST205') return 'Shared invoice storage is not installed yet. Invoices are saved only in this browser. Export a backup to keep another copy while shared storage is being set up.'
  return error?.message || 'Could not reach shared invoice storage. Your browser copy is retained. Retry when connected.'
}

export function fromCloud(row) {
  return normalizeRecord({ ...row.document, id: row.id, revision: row.revision, baseRevision: row.revision, dirty: false })
}

export async function fetchCloudInvoices(client) {
  const records = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('invoices').select('id, revision, document').order('id').range(offset, offset + 499)
    if (error) throw error
    records.push(...data.map(fromCloud))
    if (data.length < 500) return records
  }
}

export function mergeCloudRecords(remote, storage = localStorage) {
  for (const record of remote) {
    const raw = storage.getItem(RECORD_PREFIX + record.id)
    const local = raw ? JSON.parse(raw) : null
    if (!local || !local.dirty) writeRecord(record, storage)
  }
  return readHistory(storage)
}

export async function syncRecord(client, record, storage = localStorage) {
  const row = { id: record.id, revision: record.revision, document: record }
  const query = record.baseRevision
    ? client.from('invoices').update(row).eq('id', record.id).eq('revision', record.baseRevision)
    : client.from('invoices').insert(row)
  const { data, error } = await query.select('id, revision').maybeSingle()
  if (error || !data) {
    // A response can be lost after a successful write; retrying that revision is safe.
    const { data: existing, error: readError } = await client.from('invoices').select('revision').eq('id', record.id).maybeSingle()
    if (readError || existing?.revision !== record.revision) {
      if (!readError && existing) throw new Error(`Invoice ${record.invoice.invoiceNumber} changed on another device. Your edits are kept in this browser. Export them, then open the shared version to compare before changing payments.`)
      throw error || new Error('Invoice save was not confirmed. Your browser copy is retained.')
    }
  }
  const raw = storage.getItem(RECORD_PREFIX + record.id)
  const current = raw ? JSON.parse(raw) : record
  // A user may have edited again while the network write was running.
  writeRecord({ ...current, baseRevision: record.revision, dirty: current.revision !== record.revision }, storage)
}

let queue = Promise.resolve()
export function syncPending(client, storage = localStorage) {
  const task = queue.catch(() => {}).then(async () => {
    let firstError
    for (const record of readHistory(storage).filter(record => record.dirty)) {
      try { await syncRecord(client, record, storage) } catch (error) { firstError ||= error }
    }
    if (firstError) throw firstError
  })
  queue = task
  return task
}
