import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import AppointmentList from './components/AppointmentList'
import CalendarView from './components/CalendarView'
import AppointmentModal from './components/AppointmentModal'
import NewAppointmentModal from './components/NewAppointmentModal'

function formatRole(role) {
  return (role || 'viewer').replaceAll('_', ' ')
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [activeTab, setActiveTab] = useState('appointments')
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
        setLoading(false)
        return
      }

      setLoading(true)
      const [{ data: profileData, error: profileError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single()
      ])

      if (profileError) {
        setError(profileError.message)
      } else {
        setProfile(profileData)
      }

      await loadBookings()
      setLoading(false)
    }

    bootstrap()
  }, [session])

  async function loadBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .neq('status', 'archived')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setBookings(data || [])
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return bookings

    return bookings.filter((booking) =>
      [
        booking.name,
        booking.phone,
        booking.vehicle,
        booking.service,
        booking.appointment_date,
        booking.appointment_time,
        booking.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [bookings, search])

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
          <h2>Operations</h2>
          <p className="muted">Official internal portal</p>
        </div>

        <nav className="side-nav">
          <button className={activeTab === 'appointments' ? 'active' : ''} onClick={() => setActiveTab('appointments')}>
            Appointments
          </button>
          <button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>
            Calendar
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
              {activeTab === 'appointments' && 'Appointments'}
              {activeTab === 'calendar' && 'Calendar'}
              {activeTab === 'leads' && 'Lead pipeline'}
            </h1>
          </div>

       <div className="header-actions">
          <input
            className="search-input"
            placeholder="Search appointments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className="primary-btn"
            onClick={() => setShowNewModal(true)}
          >
            + New Appointment
          </button>
        </div>
        </header>

        {error ? <div className="error-box">{error}</div> : null}

        {activeTab === 'appointments' ? (
          <>
          <section className="stats-grid stats-grid-owner">
            <article className="stat-card">
              <span>Today Appointments</span>
              <strong>
                {
                  filteredBookings.filter(
                    (b) =>
                      b.appointment_date ===
                      new Date().toISOString().split('T')[0]
                  ).length
                }
              </strong>
            </article>

            <article className="stat-card">
              <span>Overdue Follow Ups</span>
              <strong>
                {
                  filteredBookings.filter(
                    (b) => b.status === 'follow_up_needed'
                  ).length
                }
              </strong>
            </article>

            <article className="stat-card">
              <span>Cars In Shop</span>
              <strong>
                {
                  filteredBookings.filter(
                    (b) => b.status === 'car_in_shop'
                  ).length
                }
              </strong>
            </article>

            <article className="stat-card">
              <span>Waiting On Parts</span>
              <strong>
                {
                  filteredBookings.filter(
                    (b) => b.status === 'waiting_on_parts'
                  ).length
                }
              </strong>
            </article>

            <article className="stat-card">
              <span>Completed This Week</span>
              <strong>
                {
                  filteredBookings.filter((b) => {
                    if (b.status !== 'completed') return false
                    const d = new Date(b.appointment_date)
                    const weekAgo = new Date()
                    weekAgo.setDate(weekAgo.getDate() - 7)
                    return d >= weekAgo
                  }).length
                }
              </strong>
            </article>

            <article className="stat-card">
              <span>This Week Appointments</span>
              <strong>
                {
                  filteredBookings.filter((b) => {
                    const d = new Date(b.appointment_date)
                    const weekAgo = new Date()
                    weekAgo.setDate(weekAgo.getDate() - 7)
                    return d >= weekAgo
                  }).length
                }
              </strong>
            </article>
          </section>

            <AppointmentList bookings={filteredBookings} onSelect={setSelectedBooking} />
          </>
        ) : null}

        {activeTab === 'calendar' ? (
          <CalendarView bookings={filteredBookings} onSelect={setSelectedBooking} />
        ) : null}

        {activeTab === 'leads' ? (
          <div className="placeholder-card">
            <h3>Leads module ready for next phase</h3>
            <p>
              The SQL in this starter already creates a <code>leads</code> table for repair leads,
              buy/sell leads, and salesman assignments. Next step is wiring this tab to the same UI pattern.
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
    </div>
  )
}
