function formatStatus(status) {
  return (status || 'new').replaceAll('_', ' ')
}

function getDaysInShop(dropoffDate, pickupDate) {
  if (!dropoffDate) return null

  const start = new Date(`${dropoffDate}T00:00:00`)
  const end = pickupDate
    ? new Date(`${pickupDate}T00:00:00`)
    : new Date()

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const diff = end - start
  return Math.max(0, Math.floor(diff / 86400000))
}

function getUrgencyLabel(booking) {
  const today = new Date().toISOString().split('T')[0]
  const days = getDaysInShop(booking.dropoff_date, booking.pickup_date)

  if (booking.status === 'archived') return 'Hidden'
  if (days !== null && days >= 7 && !booking.pickup_date) return `${days} days here`
  if (days !== null && days >= 3 && !booking.pickup_date) return `${days} days here`
  if (booking.status === 'waiting_on_parts') return 'Parts Hold'
  if (booking.status === 'follow_up_needed') return 'Needs Call'
  if (booking.status === 'car_in_shop') return 'In Progress'
  if (booking.status === 'completed') return 'Done'
  if (booking.appointment_date < today) return 'Past Due'
  if (booking.appointment_date === today) return 'Today'

  return 'Scheduled'
}

function getDaysBadgeClass(days, pickupDate) {
  if (days === null) return 'days-badge muted'
  if (pickupDate) return 'days-badge complete'
  if (days >= 7) return 'days-badge danger'
  if (days >= 3) return 'days-badge warning'
  return 'days-badge good'
}

function phoneLink(phone) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return `tel:${cleaned}`
}

function smsLink(phone) {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return `sms:${cleaned}`
}

export default function AppointmentList({
  bookings,
  onSelect,
  onStatusChange,
  onDroppedOff,
  onPickedUp
}) {
  if (bookings.length === 0) {
    return (
      <div className="empty-command-card">
        <h3>No appointments here.</h3>
        <p>This view is clean. Check another tab or add a new appointment.</p>
      </div>
    )
  }

  return (
    <div className="command-list">
      {bookings.map((booking) => {
        const days = getDaysInShop(booking.dropoff_date, booking.pickup_date)

        return (
          <article key={booking.id} className={`command-card status-border-${booking.status || 'new'}`}>
            <div className="command-main">
              <div className="command-date">
                <strong>{booking.appointment_date || 'No appt date'}</strong>
                <span>{booking.appointment_time || 'No time'}</span>
              </div>

              <div className="command-info">
                <div className="command-topline">
                  <h3>{booking.name || 'Unnamed Customer'}</h3>

                  <span className={`urgency-pill urgency-${booking.status || 'new'}`}>
                    {getUrgencyLabel(booking)}
                  </span>
                </div>

                <div className="command-subline">
                  <span>{booking.vehicle || 'Vehicle not listed'}</span>
                  <span>•</span>
                  <span>{booking.service || 'Service not listed'}</span>
                </div>

                <div className="command-subline muted">
                  <span>{booking.phone || 'No phone'}</span>
                  <span>•</span>
                  <span className={`status-pill status-${booking.status || 'new'}`}>
                    {formatStatus(booking.status)}
                  </span>
                </div>

                <div className="shop-tracking-row">
                  <span className={getDaysBadgeClass(days, booking.pickup_date)}>
                    {days === null
                      ? 'Not dropped off'
                      : booking.pickup_date
                        ? `Was here ${days} day${days === 1 ? '' : 's'}`
                        : `In shop ${days} day${days === 1 ? '' : 's'}`}
                  </span>

                  <span className="tracking-detail">
                    Drop-off: {booking.dropoff_date || '—'}
                  </span>

                  <span className="tracking-detail">
                    Pickup: {booking.pickup_date || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="quick-actions">
              {booking.phone ? (
                <>
                  <a className="ghost-btn small" href={phoneLink(booking.phone)}>
                    Call
                  </a>

                  <a className="ghost-btn small" href={smsLink(booking.phone)}>
                    Text
                  </a>
                </>
              ) : null}

              <button className="ghost-btn small" onClick={() => onSelect(booking)}>
                Open
              </button>

              {booking.status !== 'archived' && !booking.dropoff_date ? (
                <button
                  className="primary-btn small"
                  onClick={() => onDroppedOff(booking.id)}
                >
                  Dropped Off
                </button>
              ) : null}

              {booking.status !== 'confirmed' && booking.status !== 'archived' ? (
                <button
                  className="ghost-btn small"
                  onClick={() => onStatusChange(booking.id, 'confirmed')}
                >
                  Confirm
                </button>
              ) : null}

              {booking.status !== 'car_in_shop' && booking.status !== 'archived' ? (
                <button
                  className="ghost-btn small"
                  onClick={() => onStatusChange(booking.id, 'car_in_shop')}
                >
                  In Shop
                </button>
              ) : null}

              {booking.status !== 'waiting_on_parts' && booking.status !== 'archived' ? (
                <button
                  className="ghost-btn small"
                  onClick={() => onStatusChange(booking.id, 'waiting_on_parts')}
                >
                  Parts
                </button>
              ) : null}

              {booking.status !== 'completed' && booking.status !== 'archived' ? (
                <button
                  className="success-btn small"
                  onClick={() => onPickedUp(booking.id)}
                >
                  Picked Up
                </button>
              ) : null}

              {booking.status !== 'archived' ? (
                <button
                  className="archive-btn small"
                  onClick={() => onStatusChange(booking.id, 'archived')}
                >
                  Hide
                </button>
              ) : (
                <button
                  className="primary-btn small"
                  onClick={() => onStatusChange(booking.id, 'new')}
                >
                  Restore
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}