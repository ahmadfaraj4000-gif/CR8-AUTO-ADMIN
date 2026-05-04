import logo from '../assets/logo.png'
import { useMemo, useState } from 'react'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

function money(value) {
  const number = Number(value || 0)
  return currency.format(Number.isFinite(number) ? number : 0)
}

function newLineItem(type = 'part') {
  return {
    id: crypto.randomUUID(),
    type,
    description: '',
    quantity: 1,
    rate: ''
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function InvoiceGenerator() {
  const [invoiceView, setInvoiceView] = useState('edit')
  const [invoice, setInvoice] = useState({
    invoiceNumber: `CR8-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    invoiceDate: todayISO(),
    dueDate: todayISO(),
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    vehicle: '',
    vin: '',
    mileage: '',
    plate: '',
    taxRate: '8',
    discount: '',
    amountPaid: '',
    notes: 'Thank you for choosing CR8 Autos. Payment is due upon completion unless otherwise agreed in writing.',
    terms: 'All parts and labor are listed above. Warranty coverage may vary by repair type and part supplier.'
  })

  const [items, setItems] = useState([
    newLineItem('part'),
    newLineItem('labor')
  ])

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

  function clearInvoice() {
    setInvoice((current) => ({
      ...current,
      invoiceNumber: `CR8-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      invoiceDate: todayISO(),
      dueDate: todayISO(),
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      vehicle: '',
      vin: '',
      mileage: '',
      plate: '',
      discount: '',
      amountPaid: ''
    }))
    setItems([newLineItem('part'), newLineItem('labor')])
  }

  const totals = useMemo(() => {
    const partsSubtotal = items
      .filter((item) => item.type === 'part')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0)

    const laborSubtotal = items
      .filter((item) => item.type === 'labor')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0)

    const otherSubtotal = items
      .filter((item) => item.type === 'other')
      .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0)

    const subtotal = partsSubtotal + laborSubtotal + otherSubtotal
    const discount = Number(invoice.discount || 0)
    const taxableAmount = Math.max(0, subtotal - discount)
    const tax = taxableAmount * (Number(invoice.taxRate || 0) / 100)
    const total = taxableAmount + tax
    const amountPaid = Number(invoice.amountPaid || 0)
    const balanceDue = Math.max(0, total - amountPaid)

    return {
      partsSubtotal,
      laborSubtotal,
      otherSubtotal,
      subtotal,
      discount,
      tax,
      total,
      amountPaid,
      balanceDue
    }
  }, [items, invoice.discount, invoice.taxRate, invoice.amountPaid])

  return (
    <section className="invoice-module">
      <div className="invoice-actions no-print">
        <div>
          <p className="eyebrow">Invoice Generator</p>
          <h2>Create a customer invoice</h2>
          <p className="muted">Fill in the repair details, review totals, then print or save as PDF.</p>
        </div>

        <div className="invoice-action-buttons">
          <button
            className={invoiceView === 'edit' ? 'primary-btn' : 'ghost-btn'}
            onClick={() => setInvoiceView('edit')}
          >
            Edit Invoice
          </button>

          <button
            className={invoiceView === 'preview' ? 'primary-btn' : 'ghost-btn'}
            onClick={() => setInvoiceView('preview')}
          >
            Preview Invoice
          </button>

          <button className="ghost-btn" onClick={clearInvoice}>Clear</button>
          <button className="primary-btn" onClick={() => { setInvoiceView('preview'); setTimeout(() => window.print(), 80) }}>Print / Save PDF</button>
        </div>
      </div>

      <div className="invoice-workspace">
        <div className={`invoice-form no-print ${invoiceView === 'edit' ? 'active' : ''}`}>
          <div className="invoice-form-section">
            <h3>Invoice Details</h3>
            <div className="invoice-form-grid">
              <label>
                Invoice #
                <input value={invoice.invoiceNumber} onChange={(e) => updateInvoice('invoiceNumber', e.target.value)} />
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
            <h3>Customer</h3>
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
                <input type="number" step="0.01" value={invoice.amountPaid} onChange={(e) => updateInvoice('amountPaid', e.target.value)} />
              </label>
            </div>
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
                <h1>INVOICE</h1>
                <p>Invoice #: {invoice.invoiceNumber}</p>
                <p>Date: {new Date(invoice.invoiceDate).toLocaleDateString()}</p>
                <p>Due: {new Date(invoice.dueDate).toLocaleDateString()}</p>
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
              <div><span>Paid</span><strong>{money(totals.amountPaid)}</strong></div>
              <div className="balance-row"><span>Balance Due</span><strong>{money(totals.balanceDue)}</strong></div>
            </div>
          </div>

          <footer className="invoice-footer">
            <p>Thank you for your business.</p>
          </footer>
        </article>
      </div>
    </section>
  )
}
