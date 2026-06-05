import { useState } from 'react'
import { supabase } from '../lib/supabase'

const rideServices = [
  'Executive Services',
  'Wedding Chauffeur',
  'Corporate Black Car Service',
  'Night Out VIP Ride',
  'Airport Transfer'
]

function isRideService(service) {
  return rideServices.includes(service)
}

function normalizeBookingTime(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/)
  if (!match) return raw

  let hour = Number(match[1])
  const minute = match[2] || '00'
  const meridiem = match[3]

  if (meridiem === 'PM' && hour !== 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}`
}

function timeToMinutes(value) {
  const normalized = normalizeBookingTime(value)
  const [hour, minute] = normalized.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function blocksOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA
}

async function isSlotAlreadyBooked({ date, time, service, rideEndTime }) {
  const normalizedTime = normalizeBookingTime(time)

  const { data, error } = await supabase
    .from('bookings')
    .select('id, appointment_time, service, status, ride_start_time, ride_end_time')
    .eq('appointment_date', date)

  if (error) throw error

  const exactSlotTaken = (data || []).some((booking) => (
    booking.status !== 'cancelled' &&
    booking.status !== 'archived' &&
    normalizeBookingTime(booking.appointment_time) === normalizedTime
  ))

  if (exactSlotTaken) return true
  if (!isRideService(service) || !rideEndTime) return false

  return (data || []).some((booking) => (
    booking.status !== 'cancelled' &&
    booking.status !== 'archived' &&
    isRideService(booking.service) &&
    booking.ride_start_time &&
    booking.ride_end_time &&
    blocksOverlap(
      timeToMinutes(normalizedTime),
      timeToMinutes(rideEndTime),
      timeToMinutes(booking.ride_start_time),
      timeToMinutes(booking.ride_end_time)
    )
  ))
}

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
    ride_duration_hours: '1',
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

    if (!form.appointment_date || !form.appointment_time) {
      setError('Appointment date and time are required.')
      setSaving(false)
      return
    }

    const rideStartMinutes = timeToMinutes(form.appointment_time)
    const rideEndMinutes = isRideService(form.service)
      ? rideStartMinutes + Number(form.ride_duration_hours || 1) * 60
      : null
    const rideEndTime = isRideService(form.service)
      ? minutesToTime(rideEndMinutes)
      : null

    if (rideEndMinutes && rideEndMinutes > 24 * 60) {
      setError('Elite Ride blocks must end before midnight. Choose an earlier start time or shorter duration.')
      setSaving(false)
      return
    }

    try {
      const alreadyBooked = await isSlotAlreadyBooked({
        date: form.appointment_date,
        time: form.appointment_time,
        service: form.service,
        rideEndTime
      })
      if (alreadyBooked) {
        setError(isRideService(form.service)
          ? 'That Ford Expedition ride block overlaps another booking. Choose another time.'
          : 'That appointment time is already booked. Choose another time.')
        setSaving(false)
        return
      }
    } catch (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    const hasDropoff = !!form.dropoff_date

    const payload = {
      ...form,
      appointment_time: normalizeBookingTime(form.appointment_time),
      status: hasDropoff ? 'car_in_shop' : 'new',
      created_source: 'admin',
      pickup_date: null
    }

    if (isRideService(form.service)) {
      payload.ride_start_time = normalizeBookingTime(form.appointment_time)
      payload.ride_end_time = rideEndTime
      payload.ride_duration_hours = Number(form.ride_duration_hours || 1)
      payload.notes = [
        `Ride block: ${payload.ride_start_time}-${payload.ride_end_time} (${payload.ride_duration_hours} hour${payload.ride_duration_hours === 1 ? '' : 's'})`,
        form.notes
      ].filter(Boolean).join('\n\n')
    } else {
      delete payload.ride_duration_hours
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

        {isRideService(form.service) ? (
          <>
            <label className="field-label">Elite Ride Duration</label>
            <select
              value={form.ride_duration_hours}
              onChange={(e) => update('ride_duration_hours', e.target.value)}
            >
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="3">3 hours</option>
              <option value="4">4 hours</option>
              <option value="5">5 hours</option>
              <option value="6">6 hours</option>
              <option value="8">8 hours</option>
              <option value="10">10 hours</option>
              <option value="12">12 hours</option>
            </select>
          </>
        ) : null}

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
