import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'

function statusColor(status) {
  switch (status) {
    case 'contacted': return '#a855f7'
    case 'follow_up_needed': return '#f59e0b'
    case 'confirmed': return '#2563eb'
    case 'car_in_shop': return '#ea580c'
    case 'waiting_on_parts': return '#eab308'
    case 'completed': return '#16a34a'
    case 'cancelled': return '#dc2626'
    default: return '#cc1f1f'
  }
}

const legend = [
  ['New', '#cc1f1f'],
  ['Contacted', '#a855f7'],
  ['Follow Up Needed', '#f59e0b'],
  ['Confirmed', '#2563eb'],
  ['Car In Shop', '#ea580c'],
  ['Waiting On Parts', '#eab308'],
  ['Completed', '#16a34a'],
  ['Cancelled', '#dc2626']
]

export default function CalendarView({ bookings, onSelect }) {
  const events = bookings.map((booking) => ({
    id: booking.id,
    title: `${booking.appointment_time || ''} • ${booking.name || booking.vehicle || 'Appointment'}`,
    start: booking.appointment_date,
    allDay: true,
    backgroundColor: statusColor(booking.status),
    borderColor: statusColor(booking.status),
    extendedProps: { booking }
  }))

  return (
    <div className="calendar-shell">

      <div className="calendar-legend">
        {legend.map(([label, color]) => (
          <div key={label} className="legend-item">
            <span
              className="legend-dot"
              style={{ backgroundColor: color }}
            ></span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        height="auto"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: ''
        }}
        events={events}
        eventClick={(info) => onSelect(info.event.extendedProps.booking)}
      />
    </div>
  )
}