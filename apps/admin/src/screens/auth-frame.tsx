import type { ReactNode } from 'react';
import { useBranding } from '@lingualab/ui';

/** The centred card the login and the first-login password change sit in. */
export function AuthFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const { instituteName, logoUrl, softwareName } = useBranding();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-card border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          {logoUrl !== null && <img src={logoUrl} alt="" className="size-10 rounded-control" />}
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-ink-muted">{softwareName} admin</span>
            {instituteName !== '' && (
              <span className="text-[13px] text-ink-muted">{instituteName}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold text-ink">{title}</h1>
          {intro !== undefined && <p className="text-sm text-ink-muted">{intro}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
