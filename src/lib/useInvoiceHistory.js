import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { ACTIVE_KEY, RECORD_PREFIX, initializeHistory, readHistory, writeRecord, editRecord } from './invoiceHistory.js'
import { cloudError, fetchCloudInvoices, mergeCloudRecords, syncPending } from './invoiceSync.js'

export default function useInvoiceHistory() {
  const [initial] = useState(() => {
    try { return { record: initializeHistory(), history: readHistory(), error: '' } }
    catch (error) { return { record: null, history: [], error: `Browser invoice storage could not be opened: ${error.message}. Existing data has been left in place.` } }
  })
  const [record, setRecord] = useState(initial.record)
  const [history, setHistory] = useState(initial.history)
  const [error, setError] = useState(initial.error)
  const [status, setStatus] = useState('Saved in this browser; checking shared storage…')
  const current = useRef(record)
  const mounted = useRef(true)
  current.current = record

  function refreshLocal() {
    const records = readHistory()
    if (mounted.current) setHistory(records)
    return records
  }

  function change(next) {
    try {
      // Merge the latest sync acknowledgement before making another edit.
      const stored = current.current && JSON.parse(localStorage.getItem(RECORD_PREFIX + current.current.id) || 'null')
      if (typeof next === 'function' && stored && stored.revision !== current.current.revision) throw new Error('This invoice changed in another tab. Refresh history before editing it.')
      const base = stored?.revision === current.current?.revision ? stored : current.current
      const value = typeof next === 'function' ? next(base) : next
      writeRecord(value)
      localStorage.setItem(ACTIVE_KEY, value.id)
      current.current = value
      setRecord(value)
      refreshLocal()
      setStatus(value.dirty ? 'Saved in this browser; waiting to sync…' : 'Saved to shared invoice history')
      return true
    } catch (failure) {
      setError(`Invoice could not be saved in this browser: ${failure.message}. Export a backup before leaving this page.`)
      return false
    }
  }

  async function sync() {
    try {
      if (mounted.current) setStatus('Saving to shared invoice history…')
      await syncPending(supabase)
      if (!mounted.current) return
      refreshLocal()
      setError('')
      setStatus(readHistory().some(r => r.dirty) ? 'Saved in this browser; waiting to sync…' : 'Saved to shared invoice history')
    } catch (failure) {
      if (mounted.current) {
        setError(cloudError(failure))
        setStatus('Saved in this browser only')
      }
    }
  }

  async function refresh() {
    try {
      refreshLocal()
      const remote = await fetchCloudInvoices(supabase)
      if (!mounted.current) return
      mergeCloudRecords(remote)
      const records = refreshLocal()
      const active = records.find(r => r.id === current.current?.id)
      if (active && !active.dirty) {
        current.current = active
        setRecord(active)
      }
      await sync()
    } catch (failure) { if (mounted.current) { setError(cloudError(failure)); setStatus('Saved in this browser only') } }
  }

  useEffect(() => {
    mounted.current = true
    if (initial.record) refresh()
    const online = () => refresh()
    const storageChanged = (event) => {
      if (!event.key?.startsWith(RECORD_PREFIX)) return
      try {
        const records = refreshLocal()
        const active = records.find(r => r.id === current.current?.id)
        if (active) { current.current = active; setRecord(active) }
      } catch (failure) { setError(failure.message) }
    }
    window.addEventListener('online', online)
    window.addEventListener('storage', storageChanged)
    return () => { mounted.current = false; if (initial.record) syncPending(supabase).catch(() => {}); window.removeEventListener('online', online); window.removeEventListener('storage', storageChanged) }
  }, [])

  useEffect(() => {
    if (!record?.dirty) return
    const timer = window.setTimeout(sync, 1000)
    return () => window.clearTimeout(timer)
  }, [record?.revision])

  return { record, history, error, status, change, refresh, sync, setError,
    edit: (changes) => change(old => editRecord(old, typeof changes === 'function' ? changes(old) : changes)),
    open: (saved) => {
      const latest = JSON.parse(localStorage.getItem(RECORD_PREFIX + saved.id) || 'null') || saved
      return change(latest)
    }
  }
}
