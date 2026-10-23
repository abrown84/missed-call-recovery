import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-soft hover:brightness-110',
        secondary:
          'bg-surface/80 border border-border text-foreground hover:border-primary/40 hover:bg-primary/5',
        ghost:
          'text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border',
        danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
        success: 'bg-success/15 text-success border border-success/30 hover:bg-success/25',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-3 py-2 text-xs',
        lg: 'px-5 py-3',
        icon: 'p-2.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = 'Button';
