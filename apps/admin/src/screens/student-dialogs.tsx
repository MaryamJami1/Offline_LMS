import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  createUserRequestSchema,
  type AdminUser,
  type CreateUserRequest,
  type CreateUserResponse,
  type ImportResponse,
  type ResetPasswordResponse,
} from '@lingualab/shared';
import {
  Button,
  Modal,
  SelectField,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextField,
  useToast,
} from '@lingualab/ui';
import { useAdminApi } from '../api/api-context.js';
import { keys, useClasses, useRefresh } from '../api/queries.js';
import { check, problemsOfError, type FormProblems } from '../lib/form-problems.js';
import { PasswordSlip } from './password-slip.js';
import { Problem } from './problem.js';

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Add student (ADM-01): the server gives the next student ID and a first password. */
export function AddStudentDialog({
  open,
  onClose,
  classCode,
}: {
  open: boolean;
  onClose: () => void;
  classCode?: string;
}) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const classes = useClasses();
  const formId = useId();
  const [problems, setProblems] = useState<FormProblems>({});
  const [created, setCreated] = useState<CreateUserResponse | null>(null);
  const add = useMutation({
    mutationFn: (request: CreateUserRequest) => api.createUser(request),
    onSuccess: async (answer) => {
      setCreated(answer);
      await refresh(keys.allUsers, keys.classes);
    },
    onError: (error) =>
      setProblems(
        problemsOfError(error, { USERNAME_TAKEN: 'fullName', CLASS_NOT_FOUND: 'classCode' }),
      ),
  });

  function close() {
    setProblems({});
    setCreated(null);
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    const chosenClass = String(form.get('classCode') ?? '');
    const checked = check(createUserRequestSchema, {
      role: 'student',
      fullName: String(form.get('fullName') ?? ''),
      ...(phone === '' ? {} : { phone }),
      ...(chosenClass === '' ? {} : { classCode: chosenClass }),
    });
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    add.mutate(checked.value);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="Add student"
      footer={
        created === null ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" disabled={add.isPending}>
              Add student
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        )
      }
    >
      {created === null ? (
        <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {problems.form !== undefined && <Problem>{problems.form}</Problem>}
          <TextField
            label="Full name"
            name="fullName"
            autoComplete="off"
            error={problems['fullName']}
          />
          <TextField
            label="Phone (optional)"
            name="phone"
            inputMode="tel"
            error={problems['phone']}
          />
          <SelectField
            label="Class"
            name="classCode"
            defaultValue={classCode ?? ''}
            error={problems['classCode']}
          >
            <option value="">No class yet</option>
            {(classes.data?.items ?? []).map((taught) => (
              <option key={taught.id} value={taught.code}>
                {taught.code} · {taught.name}
              </option>
            ))}
          </SelectField>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            {created.user.fullName} is {created.user.username}.
          </p>
          {created.generatedPassword !== null && (
            <PasswordSlip password={created.generatedPassword} />
          )}
        </div>
      )}
    </Modal>
  );
}

/** Import from Excel (ADM-02): created students with their passwords, refused rows by number. */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  const [form, setForm] = useState<string | undefined>();
  const [result, setResult] = useState<ImportResponse | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => api.importStudents(file),
    onSuccess: async (answer) => {
      setResult(answer);
      await refresh(keys.allUsers, keys.classes);
    },
    onError: (error) => {
      const problems = problemsOfError(error, { IMPORT_FILE_INVALID: 'file' });
      setProblem(problems['file']);
      setForm(problems.form);
    },
  });

  function close() {
    setFile(null);
    setProblem(undefined);
    setForm(undefined);
    setResult(null);
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file === null) {
      setProblem('Choose a file first');
      return;
    }
    setProblem(undefined);
    setForm(undefined);
    upload.mutate(file);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="Import students"
      footer={
        result === null ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" disabled={upload.isPending}>
              Import
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        )
      }
    >
      {result === null ? (
        <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {form !== undefined && <Problem>{form}</Problem>}
          <TextField
            label="Excel or CSV file"
            name="file"
            type="file"
            accept=".xlsx,.csv"
            hint={`Columns: ${IMPORT_COLUMNS.join(', ')}. At most ${IMPORT_MAX_ROWS} students.`}
            error={problem}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </form>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          <p className="text-sm font-semibold text-ink">
            {plural(result.counts.created, 'student')} created,{' '}
            {plural(result.counts.rejected, 'row')} refused.
          </p>
          {result.created.length > 0 && (
            <>
              <p className="text-[13px] text-ink-muted">
                Write each first password on the student's slip now: they are shown only this once.
              </p>
              <Table>
                <TableCaption>Students created</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>First password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.created.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell className="font-mono text-[13px]">{row.username}</TableCell>
                      <TableCell>{row.fullName}</TableCell>
                      <TableCell>{row.classCode}</TableCell>
                      <TableCell className="font-mono text-[13px]">{row.password}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          {result.errors.length > 0 && (
            <Table>
              <TableCaption>Rows refused</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((error) => (
                  <TableRow key={`${error.row}-${error.field}`}>
                    <TableCell>{error.row}</TableCell>
                    <TableCell>{error.field}</TableCell>
                    <TableCell>{error.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Reset password (ADM-11): asked first, then the new first password once. */
export function ResetPasswordDialog({
  student,
  onClose,
}: {
  student: AdminUser | null;
  onClose: () => void;
}) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const toast = useToast();
  const [answer, setAnswer] = useState<ResetPasswordResponse | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  const reset = useMutation({
    mutationFn: (userId: string) => api.resetPassword(userId),
    onSuccess: async (result) => {
      setAnswer(result);
      toast(`${result.fullName}'s password was reset`);
      await refresh(keys.allUsers);
    },
    onError: (error) => setProblem(problemsOfError(error).form),
  });

  function close() {
    setAnswer(null);
    setProblem(undefined);
    onClose();
  }

  if (student === null) {
    return null;
  }
  return (
    <Modal
      open
      onOpenChange={(next) => (next ? undefined : close())}
      title={`Reset ${student.fullName}'s password?`}
      description="Their logins end at once, and they must choose a new password at the next login."
      footer={
        answer === null ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => reset.mutate(student.id)}
              disabled={reset.isPending}
            >
              Reset password
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        )
      }
    >
      {problem !== undefined && <Problem>{problem}</Problem>}
      {answer !== null && <PasswordSlip password={answer.generatedPassword} />}
    </Modal>
  );
}
