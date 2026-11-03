import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/**
 * A plain, semantic table (A-02 students, A-03 teachers) in shadcn/ui's parts.
 * The caption names it; column headers carry scope="col".
 */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm text-ink', className)} {...props} />;
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      className={cn('pb-2 text-left text-[15px] font-semibold text-ink', className)}
      {...props}
    />
  );
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border', className)} {...props} />;
}

export function TableHead({ className, scope, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope ?? 'col'}
      className={cn('px-3 py-2 text-left text-[13px] font-semibold text-ink-muted', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5', className)} {...props} />;
}
