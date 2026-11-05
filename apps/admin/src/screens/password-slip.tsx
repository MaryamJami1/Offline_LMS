/** A first password, shown once for the person's slip (ADM-01, ADM-11). */
export function PasswordSlip({ password }: { password: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control bg-muted px-3 py-2.5">
      <p className="text-sm text-ink">
        First password: <span className="font-mono text-[15px] font-semibold">{password}</span>
      </p>
      <p className="text-[13px] text-ink-muted">
        Write it on the slip now: it is shown only this once. It must be changed at the first login.
      </p>
    </div>
  );
}
