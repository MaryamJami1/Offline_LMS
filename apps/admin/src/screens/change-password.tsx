import { useState, type FormEvent } from 'react';
import { PASSWORD_MINIMUM_LENGTH } from '@lingualab/shared';
import { Button, TextField } from '@lingualab/ui';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { problemOf } from '../lib/format.js';
import { AuthFrame } from './auth-frame.js';

interface Problems {
  currentPassword?: string;
  newPassword?: string;
  again?: string;
  form?: string;
}

/** A first-login account changes its password before anything else (T-SEC-01). */
export function ChangePasswordScreen() {
  const { changePassword, logOut } = useSession();
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword !== String(form.get('again') ?? '')) {
      setProblems({ again: 'The two new passwords are not the same' });
      return;
    }
    setBusy(true);
    setProblems({});
    try {
      await changePassword(currentPassword, newPassword);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setProblems({ currentPassword: 'That is not your current password' });
      } else if (error instanceof ApiError && error.fields['newPassword'] !== undefined) {
        setProblems({ newPassword: error.fields['newPassword'] });
      } else {
        setProblems({ form: problemOf(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Choose a new password"
      intro="This is your first login. Choose a password only you know before you go on."
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {problems.form !== undefined && (
          <p role="alert" className="rounded-control bg-live-tint px-3 py-2 text-sm text-live">
            {problems.form}
          </p>
        )}
        <TextField
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={problems.currentPassword}
        />
        <TextField
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MINIMUM_LENGTH} characters`}
          error={problems.newPassword}
        />
        <TextField
          label="New password again"
          name="again"
          type="password"
          autoComplete="new-password"
          error={problems.again}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          Save password
        </Button>
        <Button type="button" onClick={() => void logOut()}>
          Log out
        </Button>
      </form>
    </AuthFrame>
  );
}
