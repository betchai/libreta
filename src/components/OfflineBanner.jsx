import { useConnection } from '@/lib/ConnectionContext'
import { Wifi, WifiOff } from 'lucide-react'
export default function OfflineBanner() {
  const { isOnline, restoredFlash } = useConnection()

  if (restoredFlash) {
    return (
      <div className="bg-pink/10 border-b border-pink/20 px-4 py-2 flex items-center justify-center gap-2 text-sm text-pink">
        <Wifi className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium">Connection restored</span>
      </div>
    )
  }

  if (isOnline) return null

  return (
    <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-800">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>No internet connection — sales cannot be completed until connection is restored.</span>
    </div>
  )
}
