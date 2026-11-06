import { useRef, useState, type FormEvent } from 'react';
import { Button, Card, TextField, useBranding } from '@lingualab/ui';
import type { ActionResult, PcPlace, Problem, StudentView } from '../bridge.js';
import { Centred, Chip, Heading, placeText } from './frame.js';

/** The prototype's larger inputs for the lab: 48 px high, 16 px text. */
const BIG_INPUT = 'min-h-12 text-base';

function FormProblem({ problem }: { problem: Problem | null }) {
  if (problem === null || problem.field !== undefined) {
    return null;
  }
  return (
    <p role="alert" className="m-0 rounded-control bg-live-tint px-3 py-2 text-sm text-live">
      {problem.message}
    </p>
  );
}

function fieldError(
  problem: Problem | null,
  field: NonNullable<Problem['field']>,
): string | undefined {
  return problem !== null && problem.field === field ? problem.message : undefined;
}

/** S-01. */
export function LoginScreen({
  place,
  notice,
  login,
}: {
  place: PcPlace;
  notice?: string;
  login: (username: string, password: string) => Promise<ActionResult>;
}) {
  const { softwareName } = useBranding();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const password = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await login(
      String(form.get('username') ?? ''),
      String(form.get('password') ?? ''),
    );
    setBusy(false);
    if (!result.ok) {
      setProblem(result.problem);
      // The student ID stays; the password is typed again.
      if (password.current !== null) password.current.value = '';
    }
  }

  return (
    <Centred>
      <Heading title={`Log in to ${softwareName}`} chip={`This PC: ${placeText(place)}`} />
      {notice !== undefined && (
        <p
          role="status"
          className="m-0 rounded-control bg-primary-tint px-3 py-2 text-center text-sm text-ink"
        >
          {notice}
        </p>
      )}
      <Card className="gap-4 rounded-[14px] p-5">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <FormProblem problem={problem} />
          <TextField
            label="Student ID"
            name="username"
            placeholder="e.g. S-1001"
            autoComplete="username"
            autoFocus
            className={`${BIG_INPUT} font-mono`}
            error={fieldError(problem, 'username')}
          />
          <TextField
            ref={password}
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            className={BIG_INPUT}
            error={fieldError(problem, 'password')}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className="min-h-12 w-full text-[15px]"
          >
            Log in
          </Button>
        </form>
      </Card>
      <p className="m-0 text-center text-sm text-ink-muted">
        Sit at any free PC. Your lessons, recordings and marks follow your account, not the
        computer.
      </p>
    </Centred>
  );
}

/** The first login: a new password before anything else (STU-01). */
export function ChangePasswordScreen({
  place,
  student,
  changePassword,
  logout,
}: {
  place: PcPlace;
  student: StudentView;
  changePassword: (current: string, next: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
}) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get('newPassword') ?? '');
    if (String(form.get('newPasswordAgain') ?? '') !== next) {
      setProblem({ field: 'newPassword', message: 'The two passwords are not the same' });
      return;
    }
    setBusy(true);
    const result = await changePassword(String(form.get('currentPassword') ?? ''), next);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.problem);
    }
  }

  return (
    <Centred>
      <Heading title="Choose a new password" chip={`${student.username} · ${placeText(place)}`} />
      <p className="m-0 text-center text-sm text-ink-muted">
        {student.fullName}, this is your first login. Choose a password only you know, at least 8
        characters.
      </p>
      <Card className="gap-4 rounded-[14px] p-5">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <FormProblem problem={problem} />
          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            className={BIG_INPUT}
            error={fieldError(problem, 'currentPassword')}
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            className={BIG_INPUT}
            error={fieldError(problem, 'newPassword')}
          />
          <TextField
            label="New password again"
            name="newPasswordAgain"
            type="password"
            autoComplete="new-password"
            className={BIG_INPUT}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className="min-h-12 w-full text-[15px]"
          >
            Save password
          </Button>
        </form>
      </Card>
      <Button onClick={() => void logout()} className="self-center">
        Log out
      </Button>
    </Centred>
  );
}

/** Logged in. The dashboard (S-02) comes with STU-02; until then, who and where, and Log out. */
export function HomeScreen({
  place,
  student,
  logout,
}: {
  place: PcPlace;
  student: StudentView;
  logout: () => Promise<void>;
}) {
  return (
    <Centred>
      <Heading title={`Hello, ${student.fullName}`} />
      <Chip>{`${student.username} · ${placeText(place)}`}</Chip>
      <Button onClick={() => void logout()} className="self-center">
        Log out
      </Button>
    </Centred>
  );
}
