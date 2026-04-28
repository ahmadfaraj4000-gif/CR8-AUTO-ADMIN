import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NewAppointmentModal({
  open,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    vehicle: '',
    service: '',
    appointment_date: '',
    appointment_time: '',
    dropoff_date: '',
    notes: ''
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  function update(key, val) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    const hasDropoff = !!form.dropoff_date

    const payload = {
      ...form,
      status: hasDropoff ? 'car_in_shop' : 'new',
      created_source: 'admin',
      pickup_date: null
    }

    const { error } = await supabase
      .from('bookings')
      .insert([payload])

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
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Admin Action</p>
            <h3>New Appointment</h3>
          </div>

          <button className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <input
          placeholder="Customer Name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />

        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
        />

        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />

        <input
          placeholder="Vehicle"
          value={form.vehicle}
          onChange={(e) => update('vehicle', e.target.value)}
        />

        <input
          placeholder="Service"
          value={form.service}
          onChange={(e) => update('service', e.target.value)}
        />

        <label className="field-label">Appointment Date</label>
        <input
          type="date"
          value={form.appointment_date}
          onChange={(e) => update('appointment_date', e.target.value)}
        />

        <label className="field-label">Appointment Time</label>
        <input
          type="time"
          value={form.appointment_time}
          onChange={(e) => update('appointment_time', e.target.value)}
        />

        <label className="field-label">Drop Off Date</label>
        <input
          type="date"
          value={form.dropoff_date}
          onChange={(e) => update('dropoff_date', e.target.value)}
        />

        <textarea
          rows="5"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
        />

        {form.dropoff_date ? (
          <div className="info-box">
            Vehicle will be created as <strong>Car In Shop</strong>.
          </div>
        ) : null}

        {error ? <div className="error-box">{error}</div> : null}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Cancel
          </button>

          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Create Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}