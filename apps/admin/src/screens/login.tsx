import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button, TextField, useBranding } from '@lingualab/ui';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { problemOf, timeOfDay } from '../lib/format.js';
import { AuthFrame } from './auth-frame.js';

interface Problems {
  password?: string;
  form?: string;
}

function problemsOf(error: unknown): Problems {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return { password: 'Wrong username or password' };
    }
    if (error.code === 'ACCOUNT_LOCKED') {
      const unlocksAt = error.details['unlocksAt'];
      return {
        form:
          typeof unlocksAt === 'string'
            ? `Too many wrong passwords. Try again after ${timeOfDay(unlocksAt)}.`
            : 'Too many wrong passwords. Try again later.',
      };
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return { form: 'This account has been deactivated.' };
    }
  }
  return { form: problemOf(error) };
}

/** Where the visitor was going before they were asked to log in. */
function destinationOf(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && from !== '/login' ? from : '/';
}

export function LoginScreen() {
  const { state, logIn } = useSession();
  const { softwareName } = useBranding();
  const location = useLocation();
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);

  if (state.status === 'in') {
    return <Navigate to={destinationOf(location.state)} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setProblems({});
    try {
      await logIn(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
    } catch (error) {
      setProblems(problemsOf(error));
    } finally {
      setBusy(false);
    }
  }

  const notice = state.status === 'out' ? state.notice : undefined;
  const formProblem = problems.form ?? notice;

  return (
    <AuthFrame title={`Log in to ${softwareName}`}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {formProblem !== undefined && (
          <p role="alert" className="rounded-control bg-live-tint px-3 py-2 text-sm text-live">
            {formProblem}
          </p>
        )}
        <TextField label="Username" name="username" autoComplete="username" required />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={problems.password}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          Log in
        </Button>
      </form>
    </AuthFrame>
  );
}
