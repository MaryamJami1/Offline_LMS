import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, Modal, TextField } from '@lingualab/ui';
import type { ActionResult, Problem } from '../bridge.js';

/**
 * The admin's way out of the kiosk (STU-06), opened only by Ctrl+Alt+Shift+Q.
 * The PIN goes to the main process, which asks the server; the app closes only
 * when the server says it is right.
 */
export function ExitDialog({
  open,
  onClose,
  exit,
}: {
  open: boolean;
  onClose: () => void;
  exit: (pin: string) => Promise<ActionResult>;
}) {
  const formId = useId();
  const pin = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setProblem(null);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await exit(pin.current?.value ?? '');
    setBusy(false);
    if (!result.ok) {
      setProblem(result.problem);
      if (pin.current !== null) {
        pin.current.value = '';
        pin.current.focus();
      }
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="Close the student app"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy}>
            Close app
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {problem !== null && problem.field === undefined && (
          <p role="alert" className="m-0 rounded-control bg-live-tint px-3 py-2 text-sm text-live">
            {problem.message}
          </p>
        )}
        <TextField
          ref={pin}
          label="Admin PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          autoFocus
          error={problem?.field === 'pin' ? problem.message : undefined}
        />
      </form>
    </Modal>
  );
}
