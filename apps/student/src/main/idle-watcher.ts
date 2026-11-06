/** Logged out after this long with no input anywhere on the PC (STU-07). */
export const IDLE_LIMIT_SECONDS = 30 * 60;

/** How often Windows is asked how long the PC has been idle. */
export const IDLE_CHECK_SECONDS = 30;

export interface IdleControl {
  /** A teacher takeover started (STU-03): nobody is logged out for being idle meanwhile. */
  pause(): void;
  /** It ended: the 30 minutes start again from now. */
  resume(): void;
}

export interface IdleWatcher extends IdleControl {
  start(): void;
  stop(): void;
}

/**
 * Watches the PC's idle time, as Windows counts it, while a student is logged
 * in, and calls `onIdle` once it reaches 30 minutes.
 */
export function createIdleWatcher(options: {
  /** Seconds since the last key press or mouse move: powerMonitor.getSystemIdleTime. */
  idleSeconds: () => number;
  onIdle: () => void;
}): IdleWatcher {
  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  /** When the last takeover ended, so time spent watching it is not counted. */
  let resumedAt: number | null = null;

  function check(): void {
    if (paused) {
      return;
    }
    const sinceResume =
      resumedAt === null ? Number.POSITIVE_INFINITY : (Date.now() - resumedAt) / 1000;
    if (Math.min(options.idleSeconds(), sinceResume) >= IDLE_LIMIT_SECONDS) {
      options.onIdle();
    }
  }

  return {
    start() {
      if (timer === null) {
        resumedAt = null;
        timer = setInterval(check, IDLE_CHECK_SECONDS * 1000);
      }
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      resumedAt = Date.now();
    },
  };
}
