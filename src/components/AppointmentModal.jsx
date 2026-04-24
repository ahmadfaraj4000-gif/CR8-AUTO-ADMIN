import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const statusOptions = [
  'new',
  'contacted',
  'follow_up_needed',
  'confirmed',
  'car_in_shop',
  'waiting_on_parts',
  'completed',
  'cancelled'
]

function formatStatus(status) {
  return (status || 'new').replaceAll('_', ' ')
}

export default function AppointmentModal({ booking, onClose, onSaved }) {
  const [status, setStatus] = useState('new')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (booking) {
      setStatus(booking.status || 'new')
      setNotes(booking.notes || '')
    }
  }, [booking])

  useEffect(() => {
    async function loadCustomerHistory() {
      if (!booking?.name) {
        setHistory([])
        return
      }

      setHistoryLoading(true)

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('name', booking.name)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })

      if (error) {
        setError(error.message)
        setHistory([])
        setHistoryLoading(false)
        return
      }

      setHistory(data || [])
      setHistoryLoading(false)
    }

    if (booking) loadCustomerHistory()
  }, [booking])

  const lifetime = useMemo(() => {
    const rows = history || []
    return {
      totalVisits: rows.length,
      completedJobs: rows.filter((item) => item.status === 'completed').length,
      openJobs: rows.filter((item) =>
        ['new', 'contacted', 'follow_up_needed', 'confirmed', 'car_in_shop', 'waiting_on_parts'].includes(item.status)
      ).length,
      lastVisit: rows[0]?.appointment_date || '—',
      services: [...new Set(rows.map((item) => item.service).filter(Boolean))],
      recentNotes: rows.filter((item) => item.notes).slice(0, 5)
    }
  }, [history])

  if (!booking) return null

  async function handleSave() {
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('bookings')
      .update({
        status,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking.id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Appointment</p>
            <h3>{booking.name || 'Appointment'}</h3>
            <p className="muted modal-subtitle">
              {booking.service || 'Service'} · {booking.appointment_date || '—'} · {booking.appointment_time || '—'}
            </p>
          </div>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>

        <div className="detail-grid">
          <div><strong>Phone:</strong> {booking.phone || '—'}</div>
          <div><strong>Email:</strong> {booking.email || '—'}</div>
          <div><strong>Vehicle:</strong> {booking.vehicle || '—'}</div>
          <div><strong>Service:</strong> {booking.service || '—'}</div>
          <div><strong>Date:</strong> {booking.appointment_date || '—'}</div>
          <div><strong>Time:</strong> {booking.appointment_time || '—'}</div>
        </div>

        <div className="customer-lifetime-panel">
          <div className="customer-lifetime-header">
            <div>
              <p className="eyebrow">Customer history</p>
              <h4>Customer lifetime panel</h4>
            </div>
            {historyLoading ? <span className="muted">Loading history…</span> : null}
          </div>

          <div className="lifetime-grid">
            <article className="mini-stat-card">
              <span>Total Visits</span>
              <strong>{lifetime.totalVisits}</strong>
            </article>
            <article className="mini-stat-card">
              <span>Completed Jobs</span>
              <strong>{lifetime.completedJobs}</strong>
            </article>
            <article className="mini-stat-card">
              <span>Open Jobs</span>
              <strong>{lifetime.openJobs}</strong>
            </article>
            <article className="mini-stat-card">
              <span>Last Visit</span>
              <strong>{lifetime.lastVisit}</strong>
            </article>
          </div>

          <div className="history-sections">
            <div className="history-card">
              <h5>Previous Services</h5>
              {lifetime.services.length ? (
                <div className="history-chip-row">
                  {lifetime.services.map((service) => (
                    <span key={service} className="history-chip">{service}</span>
                  ))}
                </div>
              ) : (
                <p className="muted">No previous services yet.</p>
              )}
            </div>

            <div className="history-card">
              <h5>Recent Notes</h5>
              {lifetime.recentNotes.length ? (
                <div className="history-note-list">
                  {lifetime.recentNotes.map((item) => (
                    <div key={item.id} className="history-note-item">
                      <div className="history-note-meta">
                        <strong>{item.appointment_date || '—'}</strong>
                        <span className={`status-pill status-${item.status || 'new'}`}>
                          {formatStatus(item.status)}
                        </span>
                      </div>
                      <div className="cell-sub">{item.notes}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No saved notes yet.</p>
              )}
            </div>
          </div>

          <div className="history-card">
            <h5>Past Appointments</h5>
            {history.length ? (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Service</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>{item.appointment_date || '—'}</td>
                        <td>{item.appointment_time || '—'}</td>
                        <td>{item.service || '—'}</td>
                        <td>
                          <span className={`status-pill status-${item.status || 'new'}`}>
                            {formatStatus(item.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No appointment history found.</p>
            )}
          </div>
        </div>

        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </select>

        <label>Internal notes</label>
        <textarea
          rows="7"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Call notes, insurance notes, parts notes, drop-off plan..."
        />

        {error ? <div className="error-box">{error}</div> : null}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}