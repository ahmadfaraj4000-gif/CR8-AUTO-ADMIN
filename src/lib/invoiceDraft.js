export const DRAFT_KEY = 'cr8InvoiceDraft'

export function todayISO(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

export function formatInvoiceDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

export function newLineItem(type = 'part') {
  return { id: crypto.randomUUID(), type, description: '', quantity: 1, rate: '' }
}

function invoiceDefaults(now) {
  return {
    invoiceDate: todayISO(now),
    dueDate: todayISO(now),
    customerName: '', customerPhone: '', customerEmail: '', customerAddress: '',
    vehicle: '', vin: '', mileage: '', plate: '',
    taxRate: '8', discount: '', amountPaid: '',
    notes: 'Thank you for choosing CR8 Autos. Payment is due upon completion unless otherwise agreed in writing.',
    terms: 'All parts and labor are listed above. Warranty coverage may vary by repair type and part supplier.'
  }
}

// Keep the counter separate from the draft so starting over never resets it.
export function newInvoice(storage = localStorage, now = new Date(), previousNumber = '') {
  const year = now.getFullYear()
  const key = `cr8InvoiceSequence:${year}`
  const previous = String(previousNumber).match(new RegExp(`^CR8-${year}-(\\d+)$`))
  const stored = Number(storage.getItem(key))
  const sequence = Math.max(Number.isSafeInteger(stored) && stored > 0 ? stored : 0, Number(previous?.[1] || 0)) + 1
  storage.setItem(key, String(sequence))
  return { ...invoiceDefaults(now), invoiceNumber: `CR8-${year}-${String(sequence).padStart(5, '0')}` }
}

export function refreshInvoiceDate(invoice, now = new Date()) {
  const today = todayISO(now)
  if (invoice.invoiceDate === today) return invoice
  return {
    ...invoice,
    invoiceDate: today,
    dueDate: invoice.dueDate === invoice.invoiceDate ? today : invoice.dueDate
  }
}

export function loadOrCreateDraft(storage = localStorage, now = new Date()) {
  let saved
  try { saved = JSON.parse(storage.getItem(DRAFT_KEY) || 'null') } catch { /* Replace an unreadable draft. */ }
  const invoice = saved?.invoice && typeof saved.invoice === 'object' && !Array.isArray(saved.invoice)
    ? { ...invoiceDefaults(now), ...saved.invoice }
    : newInvoice(storage, now)
  if (!invoice.invoiceNumber) invoice.invoiceNumber = newInvoice(storage, now).invoiceNumber
  const draft = {
    documentType: saved?.documentType === 'estimate' ? 'estimate' : 'invoice',
    invoice: refreshInvoiceDate(invoice, now),
    items: Array.isArray(saved?.items) ? saved.items : [newLineItem('part'), newLineItem('labor')]
  }
  // Persist immediately: remounts and React StrictMode reuse the same number.
  storage.setItem(DRAFT_KEY, JSON.stringify(draft))
  return draft
}
