import { base44 } from '@/api/base44Client'
import { createContext, useState, useRef, useCallback, useEffect, useContext } from 'react'
const ConnectionContext = createContext()

const HEARTBEAT_INTERVAL = 15000
const HEARTBEAT_TIMEOUT = 8000

export const ConnectionProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSeenOnline, setLastSeenOnline] = useState(navigator.onLine ? new Date() : null)
  const [restoredFlash, setRestoredFlash] = useState(false)
  const wasOnlineRef = useRef(navigator.onLine)

  const ping = useCallback(async () => {
    if (!navigator.onLine) return false
    try {
      await base44.entities.Settings.list('-updated_date', 1)
      return true
    } catch (e) {
      if (e?.status || e?.response?.status) return true
      return false
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let active = true
    const check = async () => {
      const ok = await ping()
      if (!active) return
      const wasOnline = wasOnlineRef.current
      if (ok) {
        setLastSeenOnline(new Date())
        if (!wasOnline) {
          setRestoredFlash(true)
          setTimeout(() => active && setRestoredFlash(false), 4000)
        }
        wasOnlineRef.current = true
        setIsOnline(true)
      } else {
        if (wasOnline) wasOnlineRef.current = false
        setIsOnline(false)
      }
    }
    check()
    const interval = setInterval(check, HEARTBEAT_INTERVAL)
    return () => { active = false; clearInterval(interval) }
  }, [ping])

  return (
    <ConnectionContext.Provider value={{ isOnline, lastSeenOnline, restoredFlash, ping }}>
      {children}
    </ConnectionContext.Provider>
  )
}

export const useConnection = () => {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error('useConnection must be used within a ConnectionProvider')
  return ctx
}
