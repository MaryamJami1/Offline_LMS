import type { ShellState } from '../bridge.js';
import { Centred, Heading } from './frame.js';

type JoiningState = Exclude<ShellState, { screen: 'login' | 'change-password' | 'home' }>;

function Note({ children }: { children: string }) {
  return <p className="m-0 text-center text-sm text-ink-muted">{children}</p>;
}

/** Before anyone can log in: starting, unreachable, waiting for approval, or refused (ADM-04). */
export function JoiningScreen({ state }: { state: JoiningState }) {
  switch (state.screen) {
    case 'starting':
      return (
        <Centred>
          <p className="m-0 text-center text-sm text-ink-muted">Starting…</p>
        </Centred>
      );
    case 'unreachable':
      return (
        <Centred>
          <Heading title="The server cannot be reached" />
          <Note>{`Looking for ${state.serverUrl}. Trying again every 30 seconds.`}</Note>
        </Centred>
      );
    case 'waiting':
      return (
        <Centred>
          <Heading title="Waiting for approval" chip={`This PC: ${state.hostname}`} />
          <Note>
            Ask the admin to approve this PC in Lab and seats. This screen moves on by itself.
          </Note>
        </Centred>
      );
    case 'refused':
      return (
        <Centred>
          <Heading title="This PC cannot join the lab" />
          <Note>{state.message}</Note>
        </Centred>
      );
  }
}
