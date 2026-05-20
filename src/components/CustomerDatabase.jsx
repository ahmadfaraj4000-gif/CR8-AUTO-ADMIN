function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export default function CustomerDatabase({ customers = [], onDelete }) {
  return (
    <section className="customer-database">
      <div className="customer-database-header">
        <div>
          <p className="eyebrow">Customer Database</p>
          <h2>Saved customers</h2>
          <p className="muted">Customers are gathered from appointments, estimate leads, and invoices saved in this browser.</p>
        </div>

        <strong>{customers.length}</strong>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Vehicle</th>
              <th>Source</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan="6">
                  No customers found yet.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="cell-title">{customer.name || '—'}</div>
                    <div className="cell-sub">{customer.address || 'No address saved'}</div>
                  </td>
                  <td>
                    <div className="cell-title">{customer.phone || '—'}</div>
                    <div className="cell-sub">{customer.email || '—'}</div>
                  </td>
                  <td>
                    <div className="cell-title">{customer.vehicle || '—'}</div>
                    <div className="cell-sub">
                      {[customer.vin ? `VIN ${customer.vin}` : '', customer.plate ? `Plate ${customer.plate}` : ''].filter(Boolean).join(' · ') || 'No vehicle IDs saved'}
                    </div>
                  </td>
                  <td>
                    <span className="status-pill status-confirmed">{customer.source || 'invoice'}</span>
                  </td>
                  <td>{formatDate(customer.updatedAt || customer.created_at)}</td>
                  <td>
                    <button className="delete-btn small" onClick={() => onDelete?.(customer)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
