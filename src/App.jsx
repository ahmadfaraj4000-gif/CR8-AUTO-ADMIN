import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import AppointmentList from './components/AppointmentList'
import CalendarView from './components/CalendarView'
import AppointmentModal from './components/AppointmentModal'
import NewAppointmentModal from './components/NewAppointmentModal'
import InvoiceGenerator from './components/InvoiceGenerator'
import EstimateLeads from './components/EstimateLeads'
import CustomerDatabase from './components/CustomerDatabase'
import logo from './assets/logo.png'

const CUSTOMER_KEY = 'cr8CustomerDatabase'
const DELETED_CUSTOMER_KEY = 'cr8DeletedCustomers'

function NavIcon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    focusable: 'false'
  }

  if (name === 'appointments') {
    return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8.5 12l2 2 4.5-4.5M9 18h6"/></svg>
  }
  if (name === 'calendar') {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
  }
  if (name === 'applications') {
    return <svg {...common}><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 12h5M10 16h5"/><path d="M4 7v14h10"/></svg>
  }
  if (name === 'invoices') {
    return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/></svg>
  }
  if (name === 'customers') {
    return <svg {...common}><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/></svg>
  }
  return <svg {...common}><path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4"/><path d="M18.5 10h.01"/></svg>
}

function formatRole(role) {
  return (role || 'viewer').replaceAll('_', ' ')
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatStatus(status) {
  return (status || 'new').replaceAll('_', ' ')
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

function loadSavedCustomers() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function loadDeletedCustomerKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELETED_CUSTOMER_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function customerKey(customer) {
  return [
    customer.name,
    customer.phone,
    customer.email,
    customer.vehicle,
    customer.vin
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
}

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeCustomer(customer) {
  return {
    id: customer.id || customerKey(customer) || crypto.randomUUID(),
    name: customer.name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    vehicle: customer.vehicle || '',
    vehicle_year: customer.vehicle_year || '',
    vehicle_make: customer.vehicle_make || '',
    vehicle_model: customer.vehicle_model || '',
    vin: customer.vin || '',
    mileage: customer.mileage || '',
    plate: customer.plate || '',
    source: customer.source || 'invoice',
    notes: customer.notes || '',
    sourceTable: customer.sourceTable || '',
    sourceId: customer.sourceId || '',
    photo_urls: customer.photo_urls || [],
    updatedAt: customer.updatedAt || customer.updated_at || customer.created_at || new Date().toISOString(),
    isSupabaseCustomer: Boolean(customer.isSupabaseCustomer)
  }
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  return [value]
}

function getEstimatePhotoPath(url) {
  const marker = '/storage/v1/object/public/estimate-lead-photos/'
  if (!url || !url.includes(marker)) return null
  return decodeURIComponent(url.split(marker)[1] || '').split('?')[0]
}

function dedupeCustomers(customers) {
  const seen = new Map()

  customers.map(normalizeCustomer).forEach((customer) => {
    const key = customerKey(customer)
    if (!key) return

    const existing = seen.get(key)
    if (!existing || new Date(customer.updatedAt) > new Date(existing.updatedAt)) {
      seen.set(key, customer)
    }
  })

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState([])
  const [applications, setApplications] = useState([])
  const [estimateLeads, setEstimateLeads] = useState([])
  const [supabaseCustomers, setSupabaseCustomers] = useState([])
  const [savedCustomers, setSavedCustomers] = useState(loadSavedCustomers)
  const [deletedCustomerKeys, setDeletedCustomerKeys] = useState(loadDeletedCustomerKeys)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [activeTab, setActiveTab] = useState('appointments')
  const [appointmentView, setAppointmentView] = useState('new_requests')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  function selectTab(tab) {
    setActiveTab(tab)
    setSearch('')
    setMobileNavOpen(false)
  }

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
        setEstimateLeads([])
        setSupabaseCustomers([])
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

      await Promise.all([loadBookings(), loadApplications(), loadEstimateLeads(), loadCustomers()])
      setLoading(false)
    }

    bootstrap()
  }, [session])

  useEffect(() => {
    if (!session?.user || !savedCustomers.length) return

    async function migrateLocalCustomers() {
      const existingKeys = new Set(supabaseCustomers.map(customerKey))
      const customersToMigrate = savedCustomers
        .map((customer) => normalizeCustomer({ ...customer, source: customer.source || 'invoice' }))
        .filter((customer) => customerKey(customer) && !existingKeys.has(customerKey(customer)))

      if (!customersToMigrate.length) return

      const { error } = await supabase
        .from('customers')
        .insert(customersToMigrate.map(customerToRow))

      if (error) {
        setError(error.message)
        return
      }

      localStorage.removeItem(CUSTOMER_KEY)
      setSavedCustomers([])
      await loadCustomers()
    }

    migrateLocalCustomers()
  }, [session, supabaseCustomers, savedCustomers])

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


  async function loadEstimateLeads() {
    const { data, error } = await supabase
      .from('estimate_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setEstimateLeads(data || [])
  }

  async function loadCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setSupabaseCustomers((data || []).map((customer) => normalizeCustomer({
      ...customer,
      sourceTable: 'customers',
      sourceId: customer.id,
      isSupabaseCustomer: true
    })))
  }

  async function deleteApplication(application) {
    if (!application?.id) return

    const confirmed = window.confirm(
      `Delete ${application.name || 'this application'} permanently from Supabase? This cannot be undone.`
    )
    if (!confirmed) return

    setError('')
    const { error: deleteError } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', application.id)
      .select('id')
      .single()

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setSelectedApplication(null)
    await loadApplications()
  }

  async function handleEstimateConverted() {
    await Promise.all([loadBookings(), loadEstimateLeads()])
    setActiveTab('appointments')
    setAppointmentView('new_requests')
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

  function customerToRow(customer) {
    return {
      name: customer.name || '',
      phone: customer.phone || null,
      email: customer.email || null,
      address: customer.address || null,
      vehicle: customer.vehicle || null,
      vehicle_year: customer.vehicle_year || null,
      vehicle_make: customer.vehicle_make || null,
      vehicle_model: customer.vehicle_model || null,
      vin: customer.vin || null,
      mileage: customer.mileage || null,
      plate: customer.plate || null,
      source: customer.source || 'invoice',
      notes: customer.notes || null
    }
  }

  async function saveCustomer(customer) {
    const normalized = normalizeCustomer({ ...customer, source: customer.source || 'invoice' })

    if (!normalized.name && !normalized.phone && !normalized.email) return

    const existing = supabaseCustomers.find((savedCustomer) => customerKey(savedCustomer) === customerKey(normalized))
    const row = customerToRow(normalized)

    const { error } = existing?.isSupabaseCustomer
      ? await supabase.from('customers').update(row).eq('id', existing.id)
      : await supabase.from('customers').insert([row])

    if (error) {
      setError(error.message)
      return
    }

    setDeletedCustomerKeys((keys) => {
      const nextKeys = keys.filter((key) => key !== customerKey(normalized))
      localStorage.setItem(DELETED_CUSTOMER_KEY, JSON.stringify(nextKeys))
      return nextKeys
    })

    await loadCustomers()
  }

  async function deleteCustomer(customer) {
    const selectedRecords = Array.isArray(customer.masterRecords) && customer.masterRecords.length > 0
      ? customer.masterRecords
      : [customer]

    const phones = new Set(selectedRecords.map((record) => normalizedPhone(record.phone)).filter(Boolean))
    const emails = new Set(selectedRecords.map((record) => normalizedEmail(record.email)).filter(Boolean))
    const relatedRecords = customers.filter((record) =>
      (normalizedPhone(record.phone) && phones.has(normalizedPhone(record.phone))) ||
      (normalizedEmail(record.email) && emails.has(normalizedEmail(record.email)))
    )
    const records = [...selectedRecords, ...relatedRecords].filter((record, index, all) => {
      const sourceKey = `${record.sourceTable || 'local'}:${record.sourceId || record.id}`
      return all.findIndex((candidate) => `${candidate.sourceTable || 'local'}:${candidate.sourceId || candidate.id}` === sourceKey) === index
    })

    const keys = records.map(customerKey).filter(Boolean)
    if (!keys.length) return

    const customerIds = records.filter((record) => record.sourceTable === 'customers').map((record) => String(record.sourceId || record.id)).filter(Boolean)
    const bookingIds = records.filter((record) => record.sourceTable === 'bookings').map((record) => String(record.sourceId)).filter(Boolean)
    const estimateLeadIds = records.filter((record) => record.sourceTable === 'estimate_leads').map((record) => String(record.sourceId)).filter(Boolean)
    const photoPaths = [...new Set(records
      .filter((record) => record.sourceTable === 'estimate_leads')
      .flatMap((record) => normalizeArray(record.photo_urls))
      .map(getEstimatePhotoPath)
      .filter(Boolean))]

    const confirmed = window.confirm(
      `Permanently delete ${customer.name || customer.phone || 'this customer'} from Supabase, including ${bookingIds.length} appointment(s) and ${estimateLeadIds.length} estimate lead(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setError('')
    const { error: deleteError } = await supabase.rpc('admin_delete_customer_everywhere', {
      p_customer_ids: customerIds,
      p_booking_ids: bookingIds,
      p_estimate_lead_ids: estimateLeadIds
    })

    if (deleteError) {
      const needsInstall = /admin_delete_customer_everywhere|schema cache|function/i.test(deleteError.message)
      setError(needsInstall
        ? 'The permanent-delete database function is not installed yet. Run supabase-admin-delete-functions.sql in the Supabase SQL Editor, then try again.'
        : deleteError.message)
      return
    }

    setSavedCustomers((current) => {
      const next = current.filter((savedCustomer) => !keys.includes(customerKey(savedCustomer)))
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(next))
      return next
    })

    setDeletedCustomerKeys((current) => {
      const next = current.filter((key) => !keys.includes(key))
      localStorage.setItem(DELETED_CUSTOMER_KEY, JSON.stringify(next))
      return next
    })

    await Promise.all([loadCustomers(), loadBookings(), loadEstimateLeads()])

    if (photoPaths.length) {
      const { error: photoError } = await supabase.storage
        .from('estimate-lead-photos')
        .remove(photoPaths)

      if (photoError) {
        setError(`Customer records were deleted, but Supabase Storage could not remove every estimate photo: ${photoError.message}`)
      }
    }
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


  const filteredEstimateLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return estimateLeads

    return estimateLeads.filter((lead) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.zip,
        lead.vehicle,
        lead.insurance_type,
        lead.damage_area,
        lead.damage_type,
        lead.severity,
        lead.description,
        lead.estimate_range,
        lead.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [estimateLeads, search])

  const customers = useMemo(() => {
    const bookingCustomers = bookings.map((booking) => ({
      id: `booking-${booking.id}`,
      sourceId: booking.id,
      sourceTable: 'bookings',
      name: booking.name || '',
      phone: booking.phone || '',
      email: booking.email || '',
      vehicle: booking.vehicle || '',
      source: 'appointment',
      updatedAt: booking.updated_at || booking.created_at || booking.appointment_date
    }))

    const leadCustomers = estimateLeads.map((lead) => ({
      id: `lead-${lead.id}`,
      sourceId: lead.id,
      sourceTable: 'estimate_leads',
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      address: lead.zip ? `ZIP ${lead.zip}` : '',
      vehicle: lead.vehicle || '',
      vehicle_year: lead.vehicle_year || '',
      vehicle_make: lead.vehicle_make || '',
      vehicle_model: lead.vehicle_model || '',
      vin: lead.vin || '',
      photo_urls: lead.photo_urls || [],
      source: 'estimate lead',
      updatedAt: lead.updated_at || lead.created_at
    }))

    return [...supabaseCustomers, ...savedCustomers, ...bookingCustomers, ...leadCustomers]
      .map(normalizeCustomer)
      .filter((customer) => customerKey(customer))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [bookings, estimateLeads, supabaseCustomers, savedCustomers])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers

    return customers.filter((customer) => {
      const searchable = [
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.vehicle,
        customer.vin,
        customer.plate
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [customers, search])

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
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="CR8 Autos" className="sidebar-logo" />
          <span className="sidebar-brand-divider" aria-hidden="true" />
          <div className="sidebar-brand-copy">
            <p className="eyebrow">CR8 AUTOS</p>
            <h2>Shop Command</h2>
            <p className="muted">Owner operations dashboard</p>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-collapse-toggle"
          aria-label={sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          <span aria-hidden="true">{sidebarCollapsed ? '›' : '‹'}</span>
          <span className="collapse-label">Collapse menu</span>
        </button>

        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={mobileNavOpen}
          aria-controls="admin-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">☰</span>
          <span>{mobileNavOpen ? 'Collapse' : 'Expand menu'}</span>
        </button>
        <span className="mobile-role-pill">{formatRole(profile?.role)}</span>

        <div id="admin-navigation" className={`sidebar-collapsible${mobileNavOpen ? ' open' : ''}`}>
          <nav className="side-nav" aria-label="Admin sections">
            <button title="Appointments" className={activeTab === 'appointments' ? 'active' : ''} onClick={() => selectTab('appointments')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="appointments" /></span><span className="tab-label">Appointments</span>
            </button>
            <button title="Calendar" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => selectTab('calendar')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="calendar" /></span><span className="tab-label">Calendar</span>
            </button>
            <button title="Applications" className={activeTab === 'applications' ? 'active' : ''} onClick={() => selectTab('applications')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="applications" /></span><span className="tab-label">Applications</span>
            </button>
            <button title="Invoices" className={activeTab === 'invoices' ? 'active' : ''} onClick={() => selectTab('invoices')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="invoices" /></span><span className="tab-label">Invoices</span>
            </button>
            <button title="Customers" className={activeTab === 'customers' ? 'active' : ''} onClick={() => selectTab('customers')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="customers" /></span><span className="tab-label">Customers</span>
            </button>
            <button title="Estimate Leads" className={activeTab === 'leads' ? 'active' : ''} onClick={() => selectTab('leads')}>
              <span className="tab-icon" aria-hidden="true"><NavIcon name="leads" /></span><span className="tab-label">Estimate Leads</span>
            </button>
          </nav>

          <div className="profile-box">
            <div className="profile-line"><strong>{profile?.full_name || session.user.email}</strong></div>
            <div className="profile-line profile-email">{session.user.email}</div>
            <div className="profile-line role-pill">{formatRole(profile?.role)}</div>
            <button className="ghost-btn" onClick={signOut}>Sign out</button>
          </div>
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
              {activeTab === 'customers' && 'Customers'}
              {activeTab === 'leads' && 'Estimate Leads'}
            </h1>
          </div>

          {activeTab !== 'invoices' ? (
            <div className="header-actions">
              <input
                className="search-input"
                placeholder={
                  activeTab === 'applications'
                    ? 'Search applications...'
                    : activeTab === 'customers'
                      ? 'Search customers...'
                    : activeTab === 'leads'
                      ? 'Search estimate leads...'
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
          <InvoiceGenerator customers={customers} onCustomerSaved={saveCustomer} />
        ) : null}

        {activeTab === 'customers' ? (
          <CustomerDatabase customers={filteredCustomers} onDelete={deleteCustomer} />
        ) : null}

        {activeTab === 'leads' ? (
          <EstimateLeads
            leads={filteredEstimateLeads}
            onSaved={loadEstimateLeads}
            onConverted={handleEstimateConverted}
          />
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

            <div className="modal-actions">
              <button className="delete-btn" onClick={() => deleteApplication(selectedApplication)}>
                Delete permanently
              </button>
              <button className="ghost-btn" onClick={() => setSelectedApplication(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
