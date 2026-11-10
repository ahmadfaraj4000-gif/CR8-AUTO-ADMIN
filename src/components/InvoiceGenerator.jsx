import logo from '../assets/logo.png'
import { useMemo, useState } from 'react'

import { formatInvoiceDate, newLineItem, todayISO } from '../lib/invoiceDraft'
import useInvoiceHistory from '../lib/useInvoiceHistory'
import { createRecord, addPayment, voidPayment, invoiceTotals, invoiceStatus, matchingHistory, importRecords, readHistory, LEGACY_BACKUP_KEY, RECORD_PREFIX } from '../lib/invoiceHistory'
import { supabase } from '../lib/supabase'
import { fromCloud } from '../lib/invoiceSync'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

function money(value) {
  const number = Number(value || 0)
  return currency.format(Number.isFinite(number) ? number : 0)
}

function customerKey(customer) {
  return [
    customer.customerName || customer.name,
    customer.customerPhone || customer.phone,
    customer.customerEmail || customer.email,
    customer.vehicle,
    customer.vin
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
}

function customerIdentityKey(customer) {
  const name = String(customer.customerName || customer.name || '').trim().toLowerCase()
  const phone = String(customer.customerPhone || customer.phone || '').trim().toLowerCase()
  const email = String(customer.customerEmail || customer.email || '').trim().toLowerCase()
  const address = String(customer.customerAddress || customer.address || '').trim().toLowerCase()

  if (phone || email) return [name, phone, email].filter(Boolean).join('|')
  return [name, address].filter(Boolean).join('|')
}

function vehicleKey(vehicle) {
  return [
    vehicle.vehicle,
    vehicle.vin,
    vehicle.plate
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
}

function normalizeCustomer(customer) {
  return {
    id: customer.id || customerKey(customer) || crypto.randomUUID(),
    name: customer.customerName || customer.name || '',
    phone: customer.customerPhone || customer.phone || '',
    email: customer.customerEmail || customer.email || '',
    address: customer.customerAddress || customer.address || '',
    vehicle: customer.vehicle || '',
    vin: customer.vin || '',
    mileage: customer.mileage || '',
    plate: customer.plate || '',
    source: customer.source || 'invoice',
    updatedAt: customer.updatedAt || new Date().toISOString()
  }
}

function formatVehicleTitle(vehicle) {
  return vehicle.vehicle || [vehicle.vehicle_year, vehicle.vehicle_make, vehicle.vehicle_model].filter(Boolean).join(' ') || 'Unnamed vehicle'
}

function downloadBackup() {
  const data = { version: 1, exportedAt: new Date().toISOString(), records: readHistory(), legacyDraft: localStorage.getItem(LEGACY_BACKUP_KEY) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `CR8-invoices-${todayISO()}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function InvoiceGenerator(props) {
  const store = useInvoiceHistory()
  if (!store.record) return <section className="invoice-module"><h2>Invoice recovery needed</h2><p role="alert">{store.error}</p><p>Do not clear browser data. The original draft is still stored in this browser.</p></section>
  return <InvoiceEditor {...props} store={store} />
}

function InvoiceEditor({ customers = [], onCustomerSaved, store }) {
  const [invoiceView, setInvoiceView] = useState('edit')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [vehiclePickerCustomer, setVehiclePickerCustomer] = useState(null)
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historySearch, setHistorySearch] = useState('')
  const [notice, setNotice] = useState('')
  const [payment, setPayment] = useState({ amount: '', date: todayISO(), method: 'Cash', reference: '', note: '' })
  const [voidId, setVoidId] = useState('')
  const [voidReason, setVoidReason] = useState('')
  const { record, history } = store
  const { documentType, invoice, items } = record
  const setInvoice = (change) => store.edit(old => ({ invoice: typeof change === 'function' ? change(old.invoice) : change }))
  const setItems = (change) => store.edit(old => ({ items: typeof change === 'function' ? change(old.items) : change }))
  const documentLabel = documentType === 'estimate' ? 'Estimate' : 'Invoice'
  const documentLabelUpper = documentLabel.toUpperCase()
  const totals = invoiceTotals(record)
  const relatedHistory = matchingHistory(history, invoice, invoice)
  const visibleHistory = (historyFilter === 'vehicle' ? relatedHistory : history)
    .filter(saved => historyFilter !== 'partial' || invoiceStatus(saved) === 'Partially paid')
    .filter(saved => [saved.invoice.invoiceNumber, saved.invoice.customerName, saved.invoice.customerPhone, saved.invoice.vehicle, saved.invoice.vin, saved.invoice.plate].join(' ').toLowerCase().includes(historySearch.toLowerCase()))

  function openInvoice(saved) {
    if (store.open(saved)) {
      setInvoiceView('edit')
      setPayment({ amount: '', date: todayISO(), method: 'Cash', reference: '', note: '' })
      setVoidId('')
      setNotice(`Recalled ${saved.invoice.invoiceNumber} with its saved charges and payments.`)
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const count = importRecords(JSON.parse(await file.text()))
      await store.refresh()
      setNotice(`Recovered ${count} invoice${count === 1 ? '' : 's'} from the backup. Existing invoices were retained.`)
    } catch (error) { store.setError(error.message) }
    event.target.value = ''
  }

  async function openSharedVersion() {
    try {
      const { data, error } = await supabase.from('invoices').select('id, revision, document').eq('id', record.id).single()
      if (error) throw error
      // Preserve conflicting local work as a separate recovery copy before opening the shared invoice.
      const copy = { ...record, id: crypto.randomUUID(), baseRevision: null, dirty: true, recoveredFrom: record.id,
        invoice: { ...record.invoice, invoiceNumber: record.invoice.invoiceNumber + '-LOCAL-COPY' } }
      localStorage.setItem(RECORD_PREFIX + copy.id, JSON.stringify(copy))
      store.change(fromCloud(data))
      setNotice('Opened the shared version. Your previous edits are retained as a LOCAL-COPY in history; compare before recording further payments.')
    } catch (error) { store.setError(error.message) }
  }

  const customerOptions = useMemo(() => {
    const seen = new Map()

    ;[...customers, ...history.map(saved => saved.invoice)].map(normalizeCustomer).forEach((customer) => {
      const key = customerIdentityKey(customer)
      if (!key) return

      const existing = seen.get(key) || {
        id: key,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        updatedAt: customer.updatedAt,
        vehicles: []
      }

      if ((!existing.address && customer.address) || new Date(customer.updatedAt) > new Date(existing.updatedAt || 0)) {
        existing.name = customer.name || existing.name
        existing.phone = customer.phone || existing.phone
        existing.email = customer.email || existing.email
        existing.address = customer.address || existing.address
        existing.updatedAt = customer.updatedAt || existing.updatedAt
      }

      const vehicle = {
        vehicle: customer.vehicle || '',
        vin: customer.vin || '',
        mileage: customer.mileage || '',
        plate: customer.plate || '',
        source: customer.source || 'invoice',
        updatedAt: customer.updatedAt
      }

      const keyForVehicle = vehicleKey(vehicle)
      if (keyForVehicle && !existing.vehicles.some((savedVehicle) => vehicleKey(savedVehicle) === keyForVehicle)) {
        existing.vehicles.push(vehicle)
      }

      seen.set(key, existing)
    })

    return [...seen.values()]
      .map((customer) => ({
        ...customer,
        vehicles: customer.vehicles.sort((a, b) => formatVehicleTitle(a).localeCompare(formatVehicleTitle(b)))
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, history])

  function updateInvoice(field, value) {
    setInvoice((current) => ({ ...current, [field]: value }))
  }

  function updateItem(id, field, value) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  function addItem(type) {
    setItems((current) => [...current, newLineItem(type)])
  }

  function removeItem(id) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  function startNewInvoice(context = {}) {
    const next = createRecord(invoice.invoiceNumber)
    next.documentType = documentType
    next.invoice = { ...next.invoice, ...context }
    if (store.change(next)) {
      setSelectedCustomerId('')
      setVehiclePickerCustomer(null)
      setInvoiceView('edit')
      setPayment({ amount: '', date: todayISO(), method: 'Cash', reference: '', note: '' })
      setVoidId('')
      setNotice('Started a new document. Previous invoices remain in history.')
    }
  }

  function selectCustomer(id) {
    setSelectedCustomerId(id)
    const customer = customerOptions.find((option) => option.id === id)
    if (customer) setVehiclePickerCustomer(customer)
  }

  function customerContext(customer, vehicle = {}) {
    return {
      customerName: customer.name || '', customerPhone: customer.phone || '',
      customerEmail: customer.email || '', customerAddress: customer.address || '',
      vehicle: vehicle.vehicle || '', vin: vehicle.vin || '', mileage: vehicle.mileage || '', plate: vehicle.plate || ''
    }
  }

  function selectVehicle(vehicle) {
    const customer = vehiclePickerCustomer
    const matches = matchingHistory(history, customer, vehicle)
    if (matches.length) openInvoice(matches[0])
    else startNewInvoice(customerContext(customer, vehicle))
    setSelectedCustomerId(customer.id)
    setVehiclePickerCustomer(null)
    setHistoryFilter('vehicle')
    setHistorySearch('')
    if (!matches.length) setNotice('No saved invoice was found for this customer and vehicle. A new document has been started with no previous payments.')
  }

  function addNewVehicle() {
    const customer = vehiclePickerCustomer
    startNewInvoice(customerContext(customer))
    setSelectedCustomerId(customer.id)
  }

  function recordPayment(event) {
    event.preventDefault()
    try {
      if (store.change(current => addPayment(current, payment))) {
        setPayment({ amount: '', date: todayISO(), method: 'Cash', reference: '', note: '' })
        setNotice('Payment recorded. The paid amount and balance have been updated.')
      }
    } catch (error) { store.setError(error.message) }
  }

  function saveCustomer() {
    const customer = normalizeCustomer({
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      customerEmail: invoice.customerEmail,
      customerAddress: invoice.customerAddress,
      vehicle: invoice.vehicle,
      vin: invoice.vin,
      mileage: invoice.mileage,
      plate: invoice.plate
    })

    if (!customer.name && !customer.phone && !customer.email) return
    onCustomerSaved?.(customer)
  }

  return (
    <section className="invoice-module">
      <div className="invoice-actions no-print">
        <div>
          <p className="eyebrow">Invoice Generator</p>
          <h2>Create a customer {documentLabel.toLowerCase()}</h2>
          <p className="muted">Recall saved pricing, payment history, and outstanding balances.</p>
        </div>

        <div className="invoice-action-buttons">
          <div className="invoice-action-row document-type-actions" aria-label="Document type">
            <button
              className={documentType === 'invoice' ? 'primary-btn' : 'ghost-btn'}
              onClick={() => store.edit({ documentType: 'invoice' })}
            >
              Invoice
            </button>
            <button
              className={documentType === 'estimate' ? 'primary-btn' : 'ghost-btn'}
              disabled={record.payments.some(p => !p.voidedAt)} title={record.payments.some(p => !p.voidedAt) ? 'An invoice with payments cannot be changed to an estimate' : ''} onClick={() => store.edit({ documentType: 'estimate' })}
            >
              Estimate
            </button>
          </div>

          <div className="invoice-action-row invoice-workflow-actions" aria-label="Document actions">
            <button className={invoiceView === 'edit' ? 'primary-btn' : 'ghost-btn'} onClick={() => setInvoiceView('edit')}>Edit</button>
            <button className={invoiceView === 'preview' ? 'primary-btn' : 'ghost-btn'} onClick={() => setInvoiceView('preview')}>Preview</button>
            <button className="ghost-btn" onClick={() => startNewInvoice()}>New {documentLabel}</button>
            <button className="ghost-btn" onClick={() => { saveCustomer(); store.sync() }}>Save {documentLabel}</button>
            <button className="primary-btn" onClick={() => { saveCustomer(); store.sync(); setInvoiceView('preview'); setTimeout(() => window.print(), 80) }}>Print {documentLabel}</button>
          </div>
        </div>
      </div>

      <div className="invoice-save-status no-print" role="status">{store.status}</div>
      {store.error ? <div className="invoice-error no-print" role="alert"><p>{store.error}</p><button className="ghost-btn small" onClick={store.refresh}>Retry shared storage</button>{store.error.includes(`Invoice ${record.invoice.invoiceNumber} changed on another device`) ? <button className="ghost-btn small" onClick={openSharedVersion}>Open shared version and keep my copy</button> : null}</div> : null}
      {notice ? <p className="invoice-notice no-print" role="status">{notice}</p> : null}
      <section className="invoice-history no-print" aria-label="Saved invoice history">
        <div className="invoice-section-title-row"><h3>Invoice History</h3><div className="invoice-mini-actions">
          <button className="ghost-btn small" onClick={store.refresh}>Refresh history</button>
          <button className="ghost-btn small" onClick={() => { try { downloadBackup() } catch (error) { store.setError(error.message) } }}>Export backup</button>
          <label className="ghost-btn small invoice-import">Import backup<input type="file" accept=".json,application/json" onChange={importBackup} /></label>
        </div></div>
        <div className="invoice-history-filters">
          <label>Search invoices<input placeholder="Customer, vehicle, VIN, or invoice number" value={historySearch} onChange={e => setHistorySearch(e.target.value)} /></label>
          <label>Show<select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}><option value="all">All documents</option><option value="partial">Partially paid invoices</option><option value="vehicle">This customer and vehicle</option></select></label>
        </div>
        <div className="invoice-history-list">
          {visibleHistory.length ? visibleHistory.map(saved => {
            const amounts = invoiceTotals(saved)
            return <button key={saved.id} className={`invoice-history-card ${saved.id === record.id ? 'selected' : ''}`} onClick={() => openInvoice(saved)}>
              <span><strong>{saved.invoice.invoiceNumber}</strong> · {invoiceStatus(saved)}{saved.dirty ? ' · Browser copy' : ''}</span>
              <span>{saved.invoice.customerName || 'Unnamed customer'} · {saved.invoice.vehicle || 'No vehicle'} · {formatInvoiceDate(saved.invoice.invoiceDate)}</span>
              <span>Total {money(amounts.total)} · Paid {money(amounts.amountPaid)} · Balance {money(amounts.balanceDue)}{amounts.credit > 0 ? ` · Credit ${money(amounts.credit)}` : ''}</span>
            </button>
          }) : <p className="muted">No saved invoices match this selection. Old customer records did not include invoice charges or payments.</p>}
        </div>
        <button className="ghost-btn small" onClick={() => startNewInvoice({ customerName: invoice.customerName, customerPhone: invoice.customerPhone, customerEmail: invoice.customerEmail, customerAddress: invoice.customerAddress, vehicle: invoice.vehicle, vin: invoice.vin, mileage: invoice.mileage, plate: invoice.plate })}>New {documentLabel.toLowerCase()} for this customer and vehicle</button>
      </section>

      <div className="invoice-workspace">
        <div className={`invoice-form no-print ${invoiceView === 'edit' ? 'active' : ''}`}>
          <div className="invoice-form-section">
            <h3>Invoice Details</h3>
            <div className="invoice-form-grid">
              <label>
                {documentLabel} #
                <input value={invoice.invoiceNumber} readOnly title="Assigned automatically for each new document" />
              </label>
              <label>
                Invoice Date
                <input type="date" value={invoice.invoiceDate} onChange={(e) => updateInvoice('invoiceDate', e.target.value)} />
              </label>
              <label>
                Due Date
                <input type="date" value={invoice.dueDate} onChange={(e) => updateInvoice('dueDate', e.target.value)} />
              </label>
              <label>
                NY TAX
                <input type="number" step="0.01" value={invoice.taxRate} onChange={(e) => updateInvoice('taxRate', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="invoice-form-section">
            <div className="invoice-section-title-row">
              <h3>Customer</h3>
              <button className="ghost-btn small" onClick={saveCustomer}>Save Customer</button>
            </div>
            <label>
              Existing Customer
              <select value={selectedCustomerId} onChange={(e) => selectCustomer(e.target.value)}>
                <option value="">Select a customer...</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {[customer.name, customer.phone, `${customer.vehicles.length} vehicle${customer.vehicles.length === 1 ? '' : 's'}`].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            </label>
            <div className="invoice-form-grid">
              <label>
                Name
                <input value={invoice.customerName} onChange={(e) => updateInvoice('customerName', e.target.value)} />
              </label>
              <label>
                Phone
                <input value={invoice.customerPhone} onChange={(e) => updateInvoice('customerPhone', e.target.value)} />
              </label>
              <label>
                Email
                <input value={invoice.customerEmail} onChange={(e) => updateInvoice('customerEmail', e.target.value)} />
              </label>
              <label>
                Address
                <input value={invoice.customerAddress} onChange={(e) => updateInvoice('customerAddress', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="invoice-form-section">
            <h3>Vehicle</h3>
            {selectedCustomerId ? (
              <button className="ghost-btn small" onClick={() => setVehiclePickerCustomer(customerOptions.find((option) => option.id === selectedCustomerId) || null)}>
                Choose Attached Vehicle
              </button>
            ) : null}
            <div className="invoice-form-grid">
              <label>
                Vehicle
                <input placeholder="2018 Toyota Camry" value={invoice.vehicle} onChange={(e) => updateInvoice('vehicle', e.target.value)} />
              </label>
              <label>
                VIN
                <input value={invoice.vin} onChange={(e) => updateInvoice('vin', e.target.value)} />
              </label>
              <label>
                Mileage
                <input value={invoice.mileage} onChange={(e) => updateInvoice('mileage', e.target.value)} />
              </label>
              <label>
                Plate
                <input value={invoice.plate} onChange={(e) => updateInvoice('plate', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="invoice-form-section">
            <div className="invoice-section-title-row">
              <h3>Charges</h3>
              <div className="invoice-mini-actions">
                <button className="ghost-btn small" onClick={() => addItem('part')}>+ Part</button>
                <button className="ghost-btn small" onClick={() => addItem('labor')}>+ Labor</button>
                <button className="ghost-btn small" onClick={() => addItem('other')}>+ Other</button>
              </div>
            </div>

            <div className="line-item-editor">
              {items.map((item) => (
                <div className="line-item-row" key={item.id}>
                  <select value={item.type} onChange={(e) => updateItem(item.id, 'type', e.target.value)}>
                    <option value="part">Part</option>
                    <option value="labor">Labor</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Qty/Hrs"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={(e) => updateItem(item.id, 'rate', e.target.value)}
                  />
                  <strong>{money(Number(item.quantity || 0) * Number(item.rate || 0))}</strong>
                  <button className="ghost-btn small" onClick={() => removeItem(item.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="invoice-form-section">
            <h3>Adjustments</h3>
            <div className="invoice-form-grid">
              <label>
                Discount
                <input type="number" step="0.01" value={invoice.discount} onChange={(e) => updateInvoice('discount', e.target.value)} />
              </label>
              <label>
                Amount Paid
                <input type="number" step="0.01" value={totals.amountPaid} readOnly title="Calculated from payment history" />
              </label>
            </div>
          </div>

          <div className="invoice-form-section">
            <h3>Payment History</h3>
            <p><strong>Paid {money(totals.amountPaid)} · Balance due {money(totals.balanceDue)}</strong>{totals.credit > 0 ? ` · Credit ${money(totals.credit)}` : ''}</p>
            {record.payments.length ? record.payments.map(entry => <div className="invoice-payment" key={entry.id}>
              <strong>{money(entry.amount)} · {entry.method}{entry.voidedAt ? ' · VOIDED' : ''}</strong>
              <span>{entry.date ? formatInvoiceDate(entry.date) : 'Payment date not recorded'}{entry.reference ? ` · Reference: ${entry.reference}` : ''}</span>
              {entry.note ? <span>{entry.note}</span> : null}
              {entry.voidedAt ? <span>Void reason: {entry.voidReason}</span> : <button className="ghost-btn small" onClick={() => { setVoidId(entry.id); setVoidReason('') }}>Void payment</button>}
              {voidId === entry.id ? <div><label>Reason for voiding<input value={voidReason} onChange={e => setVoidReason(e.target.value)} /></label><button className="ghost-btn small" onClick={() => { try { if (store.change(current => voidPayment(current, entry.id, voidReason))) setVoidId('') } catch (error) { store.setError(error.message) } }}>Confirm void</button><button className="ghost-btn small" onClick={() => setVoidId('')}>Cancel</button></div> : null}
            </div>) : <p className="muted">No payments recorded on this invoice.</p>}
            {documentType === 'invoice' ? <form onSubmit={recordPayment} className="invoice-payment-form">
              <h4>Record a payment</h4>
              <div className="invoice-form-grid">
                <label>Payment amount<input required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></label>
                <label>Payment date<input required type="date" value={payment.date} onChange={e => setPayment({ ...payment, date: e.target.value })} /></label>
                <label>Payment type<select value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}>{['Cash', 'Card', 'Check', 'Zelle', 'Venmo', 'Cash App', 'Bank transfer', 'Other'].map(method => <option key={method}>{method}</option>)}</select></label>
                <label>Reference / check number<input value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} /></label>
              </div>
              <label>Payment note<input value={payment.note} onChange={e => setPayment({ ...payment, note: e.target.value })} /></label>
              <button className="primary-btn" type="submit">Record payment</button>
            </form> : <p className="muted">Change this estimate to an invoice before recording a payment.</p>}
          </div>

          <div className="invoice-form-section">
            <h3>Notes / Terms</h3>
            <label>
              Notes
              <textarea value={invoice.notes} onChange={(e) => updateInvoice('notes', e.target.value)} />
            </label>
            <label>
              Terms
              <textarea value={invoice.terms} onChange={(e) => updateInvoice('terms', e.target.value)} />
            </label>
          </div>
        </div>

        <article className={`invoice-preview print-area ${invoiceView === 'preview' ? 'active' : ''}`}>
            <div className="invoice-header">
              <div className="invoice-logo-block">
                <img src={logo} alt="CR8 Autos Logo" className="invoice-logo" />

                <div className="invoice-shop-info">
                  <h2>CR8 AUTOS</h2>
                  <p>Body Shop & Repair</p>
                  <p>Watervliet, NY</p>
                  <p>(518) 495-6876</p>
                  <p>cr8autos@gmail.com</p>
                </div>
              </div>

              <div className="invoice-meta">
                <h1>{documentLabelUpper}</h1>
                <p>{documentLabel} #: {invoice.invoiceNumber}</p>
                <p>Date: {formatInvoiceDate(invoice.invoiceDate)}</p>
                {documentType === 'invoice' ? (
                  <p>Due: {formatInvoiceDate(invoice.dueDate)}</p>
                ) : (
                  <p>Valid Through: {formatInvoiceDate(invoice.dueDate)}</p>
                )}
              </div>
            </div>

          <div className="invoice-info-grid">
            <section>
              <h3>Bill To</h3>
              <p><strong>{invoice.customerName || 'Customer Name'}</strong></p>
              <p>{invoice.customerPhone || 'Customer phone'}</p>
              <p>{invoice.customerEmail || 'Customer email'}</p>
              <p>{invoice.customerAddress || 'Customer address'}</p>
            </section>

            <section>
              <h3>Vehicle</h3>
              <p><strong>{invoice.vehicle || 'Vehicle'}</strong></p>
              <p>VIN: {invoice.vin || '—'}</p>
              <p>Mileage: {invoice.mileage || '—'}</p>
              <p>Plate: {invoice.plate || '—'}</p>
            </section>

            <section>
              <h3>Shop Info</h3>
              <p><strong>CR8 Autos</strong></p>
              <p>Watervliet, NY</p>
              <p>Phone: (518) 495-6876</p>
              <p>Email: cr8autos@gmail.com</p>
            </section>
          </div>

          <table className="invoice-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Qty/Hrs</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="5">No charges added.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td>{item.description || '—'}</td>
                    <td>{item.quantity || 0}</td>
                    <td>{money(item.rate)}</td>
                    <td>{money(Number(item.quantity || 0) * Number(item.rate || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {record.payments.length ? <section className="invoice-printed-payments"><h3>Payment History</h3><table className="invoice-table"><thead><tr><th>Date</th><th>Type</th><th>Reference / Notes</th><th>Amount</th></tr></thead><tbody>{record.payments.map(entry => <tr key={entry.id}><td>{entry.date ? formatInvoiceDate(entry.date) : 'Not recorded'}</td><td>{entry.method}{entry.voidedAt ? ' (Voided)' : ''}</td><td>{[entry.reference, entry.note, entry.voidedAt ? `Void: ${entry.voidReason}` : ''].filter(Boolean).join(' · ') || '—'}</td><td>{money(entry.amount)}</td></tr>)}</tbody></table></section> : null}

          <div className="invoice-bottom-grid">
            <div className="invoice-notes-block">
              <h3>Notes</h3>
              <p>{invoice.notes}</p>
              <h3>Terms</h3>
              <p>{invoice.terms}</p>
            </div>

            <div className="invoice-totals-card">
              <div><span>Parts</span><strong>{money(totals.partsSubtotal)}</strong></div>
              <div><span>Labor</span><strong>{money(totals.laborSubtotal)}</strong></div>
              <div><span>Other</span><strong>{money(totals.otherSubtotal)}</strong></div>
              <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
              <div><span>Discount</span><strong>-{money(totals.discount)}</strong></div>
              <div><span>Tax</span><strong>{money(totals.tax)}</strong></div>
              <div><span>Total</span><strong>{money(totals.total)}</strong></div>
              {documentType === 'invoice' ? (
                <>
                  <div><span>Paid</span><strong>{money(totals.amountPaid)}</strong></div>
                  <div className="balance-row"><span>Balance Due</span><strong>{money(totals.balanceDue)}</strong></div>
                  {totals.credit > 0 ? <div><span>Credit</span><strong>{money(totals.credit)}</strong></div> : null}
                </>
              ) : (
                <div className="balance-row"><span>Estimated Total</span><strong>{money(totals.total)}</strong></div>
              )}
            </div>
          </div>

          <footer className="invoice-footer">
            <p>{documentType === 'invoice' ? 'Thank you for your business.' : 'Estimate is subject to final inspection and parts availability.'}</p>
          </footer>
        </article>
      </div>

      {vehiclePickerCustomer ? (
        <div className="vehicle-picker-backdrop no-print" role="presentation">
          <div className="vehicle-picker-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-picker-title">
            <div className="vehicle-picker-header">
              <div>
                <p className="eyebrow">Attached Vehicles</p>
                <h3 id="vehicle-picker-title">{vehiclePickerCustomer.name || 'Selected customer'}</h3>
                <p className="muted">Choose a saved vehicle or start a new vehicle for this customer.</p>
              </div>
              <button className="ghost-btn small" onClick={() => setVehiclePickerCustomer(null)}>Close</button>
            </div>

            <div className="vehicle-picker-actions">
              <button className="primary-btn" onClick={addNewVehicle}>+ Add New Vehicle</button>
            </div>

            <div className="vehicle-picker-list">
              {vehiclePickerCustomer.vehicles.length === 0 ? (
                <div className="vehicle-picker-empty">No vehicles are attached to this customer yet.</div>
              ) : (
                vehiclePickerCustomer.vehicles.map((vehicle) => (
                  <button
                    className="vehicle-picker-card"
                    key={vehicleKey(vehicle)}
                    onClick={() => selectVehicle(vehicle)}
                  >
                    <span>{formatVehicleTitle(vehicle)}</span>
                    <small>
                      {[vehicle.vin ? `VIN ${vehicle.vin}` : '', vehicle.plate ? `Plate ${vehicle.plate}` : '', vehicle.mileage ? `${vehicle.mileage} mi` : ''].filter(Boolean).join(' - ') || 'No vehicle IDs saved'}
                    </small>
                  </button>
                ))
              )}
            </div>

          </div>
        </div>
      ) : null}
    </section>
  )
}
