import { cn } from '@/lib/utils'
import * as LabelPrimitive from '@radix-ui/react-label'
import React, { forwardRef } from 'react'
const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
))
Label.displayName = 'Label'

export { Label }
