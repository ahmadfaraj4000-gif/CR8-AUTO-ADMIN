const SUPABASE_URL = process.env.SUPABASE_URL || 'https://llrjzyhdphitrjzbstoq.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_KEEPALIVE_TABLE = process.env.SUPABASE_KEEPALIVE_TABLE || 'bookings'
const SUPABASE_KEEPALIVE_SELECT = process.env.SUPABASE_KEEPALIVE_SELECT || 'appointment_date'

if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable.')
}

const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_KEEPALIVE_TABLE}`)
url.searchParams.set('select', SUPABASE_KEEPALIVE_SELECT)
url.searchParams.set('limit', '1')

const response = await fetch(url, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
})

if (!response.ok) {
  const body = await response.text()
  throw new Error(`Supabase keep-alive failed: ${response.status} ${response.statusText}\n${body}`)
}

console.log(`Supabase keep-alive succeeded for ${SUPABASE_KEEPALIVE_TABLE}.`)
