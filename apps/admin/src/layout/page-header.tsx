import type { ReactNode } from 'react';

/** The title of a screen, a line under it, and its main buttons on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] leading-tight font-bold text-ink">{title}</h1>
        {subtitle !== undefined && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
