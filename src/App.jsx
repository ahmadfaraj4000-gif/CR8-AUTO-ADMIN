import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import AppointmentList from './components/AppointmentList'
import CalendarView from './components/CalendarView'
import AppointmentModal from './components/AppointmentModal'
import NewAppointmentModal from './components/NewAppointmentModal'
import InvoiceGenerator from './components/InvoiceGenerator'

function formatRole(role) {
  return (role || 'viewer').replaceAll('_', ' ')
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function isThisWeek(dateValue) {
  if (!dateValue) return false

  const d = new Date(`${dateValue}T00:00:00`)
  const now = new Date()

  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 7)

  return d >= start && d < end
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

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [applications, setApplications] = useState([])
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [activeTab, setActiveTab] = useState('appointments')
  const [appointmentView, setAppointmentView] = useState('new_requests')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function bootstrap() {
      if (!session?.user) {
        setProfile(null)
        setBookings([])
        setApplications([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        setError(profileError.message)
      } else {
        setProfile(profileData)
      }

      await Promise.all([loadBookings(), loadApplications()])
      setLoading(false)
    }

    bootstrap()
  }, [session])

  async function loadBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setBookings(data || [])
  }

  async function loadApplications() {
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setApplications(data || [])
  }

  async function updateBookingStatus(id, status) {
    const updates = { status }

    if (status === 'car_in_shop') {
      updates.dropoff_date = todayISO()
      updates.pickup_date = null
    }

    if (status === 'completed') {
      updates.pickup_date = todayISO()
    }

    const { error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    await loadBookings()
  }

  async function markDroppedOff(id) {
    const { error } = await supabase
      .from('bookings')
      .update({
        dropoff_date: todayISO(),
        pickup_date: null,
        status: 'car_in_shop'
      })
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    await loadBookings()
  }

  async function markPickedUp(id) {
    const { error } = await supabase
      .from('bookings')
      .update({
        pickup_date: todayISO(),
        status: 'completed'
      })
      .eq('id', id)

    if (error) {
      setError(error.message)
      return
    }

    await loadBookings()
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const activeBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'archived'),
    [bookings]
  )

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase()
    let rows = activeBookings

    if (appointmentView === 'new_requests') {
      rows = activeBookings.filter((b) =>
        ['new', 'contacted', 'confirmed'].includes(b.status || 'new')
      )
    }

    if (appointmentView === 'in_shop') {
      rows = activeBookings.filter((b) => b.status === 'car_in_shop')
    }

    if (appointmentView === 'needs_attention') {
      rows = activeBookings.filter((b) => {
        const days = getDaysInShop(b.dropoff_date, b.pickup_date)
        return (
          b.status === 'waiting_on_parts' ||
          b.status === 'follow_up_needed' ||
          (days !== null && days >= 3 && !b.pickup_date)
        )
      })
    }

    if (appointmentView === 'completed_archived') {
      rows = bookings.filter((b) =>
        b.status === 'completed' || b.status === 'archived'
      )
    }

    if (!term) return rows

    return rows.filter((booking) =>
      [
        booking.name,
        booking.phone,
        booking.vehicle,
        booking.service,
        booking.appointment_date,
        booking.appointment_time,
        booking.dropoff_date,
        booking.pickup_date,
        booking.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [bookings, activeBookings, appointmentView, search])

  const filteredApplications = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return applications

    return applications.filter((app) =>
      [
        app.name,
        app.phone,
        app.email,
        app.job_type,
        app.experience,
        app.certifications,
        app.start_date,
        app.message,
        app.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [applications, search])

  const stats = useMemo(() => {
    return {
      newRequests: activeBookings.filter((b) =>
        ['new', 'contacted', 'confirmed'].includes(b.status || 'new')
      ).length,
      inShop: activeBookings.filter((b) => b.status === 'car_in_shop').length,
      needsAttention: activeBookings.filter((b) => {
        const days = getDaysInShop(b.dropoff_date, b.pickup_date)
        return (
          b.status === 'waiting_on_parts' ||
          b.status === 'follow_up_needed' ||
          (days !== null && days >= 3 && !b.pickup_date)
        )
      }).length,
      completedThisWeek: bookings.filter((b) =>
        b.status === 'completed' && isThisWeek(b.pickup_date || b.appointment_date)
      ).length
    }
  }, [bookings, activeBookings])

  if (loading) {
    return <div className="loading-screen">Loading CR8 Admin Portal...</div>
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">CR8 AUTOS</p>
          <h2>Shop Command</h2>
          <p className="muted">Owner operations dashboard</p>
        </div>

        <nav className="side-nav">
          <button className={activeTab === 'appointments' ? 'active' : ''} onClick={() => setActiveTab('appointments')}>
            Appointments
          </button>
          <button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>
            Calendar
          </button>
          <button className={activeTab === 'applications' ? 'active' : ''} onClick={() => setActiveTab('applications')}>
            Applications
          </button>
          <button className={activeTab === 'invoices' ? 'active' : ''} onClick={() => setActiveTab('invoices')}>
            Invoices
          </button>
          <button className={activeTab === 'leads' ? 'active' : ''} onClick={() => setActiveTab('leads')}>
            Leads
          </button>
        </nav>

        <div className="profile-box">
          <div className="profile-line"><strong>{profile?.full_name || session.user.email}</strong></div>
          <div className="profile-line">{session.user.email}</div>
          <div className="profile-line role-pill">{formatRole(profile?.role)}</div>
          <button className="ghost-btn" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="page-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>
              {activeTab === 'appointments' && 'Shop Command Center'}
              {activeTab === 'calendar' && 'Calendar'}
              {activeTab === 'applications' && 'Applications'}
              {activeTab === 'invoices' && 'Invoices'}
              {activeTab === 'leads' && 'Lead Pipeline'}
            </h1>
          </div>

          {activeTab !== 'invoices' ? (
            <div className="header-actions">
              <input
                className="search-input"
                placeholder={
                  activeTab === 'applications'
                    ? 'Search applications...'
                    : 'Search customer, vehicle, phone, status...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {['appointments', 'calendar'].includes(activeTab) ? (
                <button className="primary-btn header-btn" onClick={() => setShowNewModal(true)}>
                  + New Appointment
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {error ? <div className="error-box">{error}</div> : null}

        {activeTab === 'appointments' ? (
          <>
            <section className="stats-grid stats-grid-owner">
              <article className="stat-card urgent">
                <span>New Requests</span>
                <strong>{stats.newRequests}</strong>
              </article>

              <article className="stat-card blue">
                <span>Cars In Shop</span>
                <strong>{stats.inShop}</strong>
              </article>

              <article className="stat-card warning">
                <span>Needs Attention</span>
                <strong>{stats.needsAttention}</strong>
              </article>

              <article className="stat-card success">
                <span>Completed This Week</span>
                <strong>{stats.completedThisWeek}</strong>
              </article>
            </section>

            <section className="view-tabs">
              <button className={appointmentView === 'new_requests' ? 'active' : ''} onClick={() => setAppointmentView('new_requests')}>
                New Requests
              </button>
              <button className={appointmentView === 'in_shop' ? 'active' : ''} onClick={() => setAppointmentView('in_shop')}>
                In Shop
              </button>
              <button className={appointmentView === 'needs_attention' ? 'active' : ''} onClick={() => setAppointmentView('needs_attention')}>
                Waiting / Follow Up
              </button>
              <button className={appointmentView === 'completed_archived' ? 'active' : ''} onClick={() => setAppointmentView('completed_archived')}>
                Completed / Archived
              </button>
            </section>

            <AppointmentList
              bookings={filteredBookings}
              onSelect={setSelectedBooking}
              onStatusChange={updateBookingStatus}
              onDroppedOff={markDroppedOff}
              onPickedUp={markPickedUp}
            />
          </>
        ) : null}

        {activeTab === 'calendar' ? (
          <CalendarView bookings={activeBookings} onSelect={setSelectedBooking} />
        ) : null}

        {activeTab === 'applications' ? (
          <>
            <section className="stats-grid">
              <article className="stat-card">
                <span>Total Applications</span>
                <strong>{applications.length}</strong>
              </article>

              <article className="stat-card">
                <span>New Applications</span>
                <strong>{applications.filter((a) => a.status === 'new').length}</strong>
              </article>

              <article className="stat-card">
                <span>Showing</span>
                <strong>{filteredApplications.length}</strong>
              </article>
            </section>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Job</th>
                    <th>Contact</th>
                    <th>Experience</th>
                    <th>Start</th>
                    <th>Message</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan="7">
                        No applications found.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map((app) => (
                      <tr
                        key={app.id}
                        onClick={() => setSelectedApplication(app)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="cell-title">{app.name || '—'}</div>
                          <div className="cell-sub">
                            <span className={`status-pill status-${app.status || 'new'}`}>
                              {app.status || 'new'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="cell-title">{app.job_type || '—'}</div>
                          <div className="cell-sub">{app.certifications || 'No certifications listed'}</div>
                        </td>
                        <td>
                          <div className="cell-title">{app.phone || '—'}</div>
                          <div className="cell-sub">{app.email || '—'}</div>
                        </td>
                        <td>{app.experience || '—'}</td>
                        <td>{app.start_date || '—'}</td>
                        <td>{app.message || '—'}</td>
                        <td>{formatDate(app.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {activeTab === 'invoices' ? (
          <InvoiceGenerator />
        ) : null}

        {activeTab === 'leads' ? (
          <div className="placeholder-card">
            <h3>Leads module ready for next phase</h3>
            <p>
              Next step is wiring repair leads, buy/sell leads, and customer follow-up into this same command center layout.
            </p>
          </div>
        ) : null}
      </main>

      <AppointmentModal
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onSaved={loadBookings}
      />

      <NewAppointmentModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSaved={loadBookings}
      />

      {selectedApplication ? (
        <div className="modal-backdrop" onClick={() => setSelectedApplication(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Job Application</p>
                <h3>{selectedApplication.name}</h3>
              </div>

              <button className="ghost-btn" onClick={() => setSelectedApplication(null)}>
                Close
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <label>Name</label>
                <strong>{selectedApplication.name || '—'}</strong>
              </div>

              <div>
                <label>Phone</label>
                <strong>{selectedApplication.phone || '—'}</strong>
              </div>

              <div>
                <label>Email</label>
                <strong>{selectedApplication.email || '—'}</strong>
              </div>

              <div>
                <label>Job Type</label>
                <strong>{selectedApplication.job_type || '—'}</strong>
              </div>

              <div>
                <label>Experience</label>
                <strong>{selectedApplication.experience || '—'}</strong>
              </div>

              <div>
                <label>Certifications</label>
                <strong>{selectedApplication.certifications || '—'}</strong>
              </div>

              <div>
                <label>Start Date</label>
                <strong>{selectedApplication.start_date || '—'}</strong>
              </div>

              <div>
                <label>Submitted</label>
                <strong>{formatDate(selectedApplication.created_at)}</strong>
              </div>
            </div>

            <div className="placeholder-card">
              <label>Applicant Message</label>
              <p>{selectedApplication.message || 'No message provided.'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}