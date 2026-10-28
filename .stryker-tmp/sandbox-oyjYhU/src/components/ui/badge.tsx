// @ts-nocheck
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { HTMLAttributes } from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground border-border',
        emergency: 'urgency-emergency',
        high: 'urgency-high',
        normal: 'urgency-normal',
        low: 'urgency-low',
        success: 'status-converted',
        pending: 'status-pending',
        escalated: 'status-escalated',
        primary: 'bg-primary/15 text-primary border-primary/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
