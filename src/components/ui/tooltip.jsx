import { useState } from 'react'
import { cn } from '@/lib/utils'

export function Tooltip({ children, content, side = 'top' }) {
  const [show, setShow] = useState(false)
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className={cn('absolute z-50 whitespace-nowrap rounded-md bg-wine px-2.5 py-1 text-xs font-medium text-white shadow-md pointer-events-none', pos[side])}>
          {content}
        </span>
      )}
    </span>
  )
}
