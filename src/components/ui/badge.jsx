import { cn } from '@/lib/utils'
const badgeVariants = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  outline: 'text-foreground border border-input',
}

function Badge({ className, variant = 'default', ...props }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none', badgeVariants[variant], className)} {...props} />
  )
}

export { Badge }
