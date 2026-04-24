import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NewAppointmentModal({
  open,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState({
    name:'',
    phone:'',
    email:'',
    vehicle:'',
    service:'',
    appointment_date:'',
    appointment_time:'',
    notes:''
  })

  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')

  if(!open) return null

  function update(key,val){
    setForm(prev => ({...prev,[key]:val}))
  }

  async function handleSave(){
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('bookings')
      .insert([{
        ...form,
        status:'new',
        created_source:'admin'
      }])

    if(error){
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
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Admin Action</p>
            <h3>New Appointment</h3>
          </div>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>

        <input placeholder="Customer Name"
          value={form.name}
          onChange={(e)=>update('name',e.target.value)}
        />

        <input placeholder="Phone"
          value={form.phone}
          onChange={(e)=>update('phone',e.target.value)}
        />

        <input placeholder="Email"
          value={form.email}
          onChange={(e)=>update('email',e.target.value)}
        />

        <input placeholder="Vehicle"
          value={form.vehicle}
          onChange={(e)=>update('vehicle',e.target.value)}
        />

        <input placeholder="Service"
          value={form.service}
          onChange={(e)=>update('service',e.target.value)}
        />

        <input type="date"
          value={form.appointment_date}
          onChange={(e)=>update('appointment_date',e.target.value)}
        />

        <input type="time"
          value={form.appointment_time}
          onChange={(e)=>update('appointment_time',e.target.value)}
        />

        <textarea rows="5"
          placeholder="Notes"
          value={form.notes}
          onChange={(e)=>update('notes',e.target.value)}
        />

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