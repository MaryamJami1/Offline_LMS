import { useEffect, useState } from 'react';
import { BrandingProvider } from '@lingualab/ui';
import type { ShellState, StudentBridge } from '../bridge.js';
import { ChangePasswordScreen, HomeScreen, LoginScreen } from './login-screens.js';
import { JoiningScreen } from './joining-screens.js';
import { ExitDialog } from './exit-dialog.js';

/**
 * The student app's screens. Which one shows is the main process's decision
 * (ShellState); the screens only follow it and pass on what the student types.
 */
export function StudentApp({ bridge }: { bridge: StudentBridge }) {
  const [state, setState] = useState<ShellState>({ screen: 'starting' });
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let live = true;
    const stopState = bridge.onState(setState);
    const stopExit = bridge.onExitRequested(() => setExiting(true));
    void bridge.getState().then((current) => {
      if (live) setState(current);
    });
    return () => {
      live = false;
      stopState();
      stopExit();
    };
  }, [bridge]);

  return (
    <BrandingProvider fetchBranding={() => bridge.branding()}>
      <Screen state={state} bridge={bridge} />
      <ExitDialog
        open={exiting}
        onClose={() => setExiting(false)}
        exit={(pin) => bridge.exit(pin)}
      />
    </BrandingProvider>
  );
}

function Screen({ state, bridge }: { state: ShellState; bridge: StudentBridge }) {
  switch (state.screen) {
    case 'login':
      return (
        <LoginScreen
          // A fresh form for each visit, so a password never stays behind.
          key={`login-${state.notice ?? ''}`}
          place={state.place}
          notice={state.notice}
          login={(username, password) => bridge.login(username, password)}
        />
      );
    case 'change-password':
      return (
        <ChangePasswordScreen
          place={state.place}
          student={state.student}
          changePassword={(current, next) => bridge.changePassword(current, next)}
          logout={() => bridge.logout()}
        />
      );
    case 'home':
      return (
        <HomeScreen place={state.place} student={state.student} logout={() => bridge.logout()} />
      );
    default:
      return <JoiningScreen state={state} />;
  }
}
