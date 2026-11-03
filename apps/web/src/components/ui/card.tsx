import type { ComponentProps } from 'react';
import { cn } from './utils.ts';

type CardProps = ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return (
    <div className={cn('flex flex-col gap-2 p-6', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: CardProps) {
  return (
    <h2
      className={cn(
        'text-xl font-semibold leading-none tracking-tight',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: CardProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
