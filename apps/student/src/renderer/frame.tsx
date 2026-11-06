import type { ReactNode } from 'react';
import { useBranding } from '@lingualab/ui';
import type { PcPlace } from '../bridge.js';

/** The institute's logo, or the prototype's headset in the main colour (S-01). */
export function BrandMark() {
  const { logoUrl, softwareName } = useBranding();
  if (logoUrl !== null) {
    return (
      <img src={logoUrl} alt={softwareName} className="size-[52px] rounded-[14px] object-contain" />
    );
  }
  return (
    <div
      data-testid="headset-mark"
      className="flex size-[52px] items-center justify-center rounded-[14px] bg-primary"
    >
      <svg
        aria-hidden="true"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-on-primary"
      >
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
      </svg>
    </div>
  );
}

/** "LAB1-D3 · Seat D3", or "No seat yet" before the admin has placed the PC. */
export function placeText(place: PcPlace): string {
  return `${place.hostname} · ${place.seatCode === null ? 'No seat yet' : `Seat ${place.seatCode}`}`;
}

/** The small grey pill under the heading, in IBM Plex Mono as in the prototype. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="self-center rounded-full bg-muted px-[9px] py-[3px] font-mono text-xs font-semibold text-ink-muted">
      {children}
    </span>
  );
}

/** The centred column every student screen sits in, 420 px wide as in the prototype. */
export function Centred({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10 text-ink">
      <div className="flex w-full max-w-[420px] flex-col gap-5">{children}</div>
    </main>
  );
}

/** The mark, a heading and an optional chip, centred. */
export function Heading({ title, chip }: { title: string; chip?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <BrandMark />
      <h1 className="m-0 text-[26px] font-bold">{title}</h1>
      {chip !== undefined && <Chip>{chip}</Chip>}
    </div>
  );
}
