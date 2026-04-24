export default function AppointmentList({ bookings, onSelect }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Customer</th>
            <th>Vehicle</th>
            <th>Service</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <tr>
              <td colSpan="7" className="empty-cell">No appointments found.</td>
            </tr>
          ) : (
            bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.appointment_date || '—'}</td>
                <td>{booking.appointment_time || '—'}</td>
                <td>
                  <div className="cell-title">{booking.name}</div>
                  <div className="cell-sub">{booking.phone || 'No phone'}</div>
                </td>
                <td>{booking.vehicle || '—'}</td>
                <td>{booking.service || '—'}</td>
                <td>
                  <span className={`status-pill status-${booking.status || 'new'}`}>
                    {(booking.status || 'new').replaceAll('_', ' ')}
                  </span>
                </td>
                <td>
                  <button className="ghost-btn small" onClick={() => onSelect(booking)}>
                    Open
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
