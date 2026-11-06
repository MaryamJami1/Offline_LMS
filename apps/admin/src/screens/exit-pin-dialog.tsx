import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Modal, TextField, useToast } from '@lingualab/ui';
import { changeExitPinRequestSchema, type ChangeExitPinRequest } from '@lingualab/shared';
import { useAdminApi } from '../api/api-context.js';
import { keys, useRefresh } from '../api/queries.js';
import { check, problemsOfError, type FormProblems } from '../lib/form-problems.js';
import { Problem } from './problem.js';

/**
 * Changing the admin PIN that closes the student app (ADM-07, STU-06). Opened
 * from "Needs attention" on the dashboard until Settings (A-10) is built. The
 * PIN is typed twice, hidden, and the admin's own password once more.
 */
export function ExitPinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const toast = useToast();
  const formId = useId();
  const [problems, setProblems] = useState<FormProblems>({});

  const change = useMutation({
    mutationFn: ({ currentPassword, pin }: ChangeExitPinRequest) =>
      api.changeExitPin(currentPassword, pin),
    onSuccess: async () => {
      await refresh(keys.exitPin);
      toast('The exit PIN has been changed.');
      close();
    },
    onError: (error) =>
      setProblems(problemsOfError(error, { INVALID_CREDENTIALS: 'currentPassword' })),
  });

  function close() {
    setProblems({});
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pin = String(form.get('pin') ?? '');
    const checked = check(changeExitPinRequestSchema, {
      currentPassword: String(form.get('currentPassword') ?? ''),
      pin,
    });
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    if (String(form.get('pinAgain') ?? '') !== pin) {
      setProblems({ pinAgain: 'The two PINs are not the same' });
      return;
    }
    setProblems({});
    change.mutate(checked.value);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="Change the exit PIN"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={change.isPending}>
            Change PIN
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <p className="text-sm text-ink-muted">
          The six-digit PIN closes the student app on a lab PC. Every lab PC uses the new one
          straight away.
        </p>
        {problems.form !== undefined && <Problem>{problems.form}</Problem>}
        <TextField
          label="New PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          error={problems['pin']}
        />
        <TextField
          label="New PIN again"
          name="pinAgain"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          error={problems['pinAgain']}
        />
        <TextField
          label="Your password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={problems['currentPassword']}
        />
      </form>
    </Modal>
  );
}
