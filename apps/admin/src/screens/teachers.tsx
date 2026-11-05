import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  createUserRequestSchema,
  may,
  type CreateUserRequest,
  type CreateUserResponse,
} from '@lingualab/shared';
import {
  Button,
  CheckboxGroup,
  Modal,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextField,
} from '@lingualab/ui';
import { useAdminApi } from '../api/api-context.js';
import { keys, useClasses, useRefresh, useUsers } from '../api/queries.js';
import { useAdmin } from '../auth/session.js';
import { PageHeader } from '../layout/page-header.js';
import { problemOf } from '../lib/format.js';
import { check, problemsOfError, type FormProblems } from '../lib/form-problems.js';
import { AccountStatus } from './account-status.js';
import { PasswordSlip } from './password-slip.js';
import { Problem } from './problem.js';

/** The four modules of the LMS (00), in the order the prototype lists them. */
const MODULES = ['Speaking', 'Listening', 'Reading', 'Writing'] as const;

function AddTeacherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const classes = useClasses();
  const formId = useId();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classCodes, setClassCodes] = useState<string[]>([]);
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
        problemsOfError(error, { USERNAME_TAKEN: 'username', CLASS_NOT_FOUND: 'classCodes' }),
      ),
  });

  function close() {
    setSubjects([]);
    setClassCodes([]);
    setProblems({});
    setCreated(null);
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    const checked = check(createUserRequestSchema, {
      role: 'teacher',
      fullName: String(form.get('fullName') ?? ''),
      username: String(form.get('username') ?? ''),
      ...(phone === '' ? {} : { phone }),
      subjects,
      classCodes,
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
      title="Add teacher"
      footer={
        created === null ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" disabled={add.isPending}>
              Add teacher
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
            label="Username"
            name="username"
            autoComplete="off"
            hint="What they type to log in, like s.rehman"
            error={problems['username']}
          />
          <TextField
            label="Phone (optional)"
            name="phone"
            inputMode="tel"
            error={problems['phone']}
          />
          <CheckboxGroup
            legend="Modules"
            options={MODULES.map((module) => ({ value: module, label: module }))}
            value={subjects}
            onChange={setSubjects}
            error={problems['subjects']}
          />
          <CheckboxGroup
            legend="Classes"
            options={(classes.data?.items ?? []).map((taught) => ({
              value: taught.code,
              label: `${taught.code} · ${taught.name}`,
            }))}
            value={classCodes}
            onChange={setClassCodes}
            error={problems['classCodes']}
          />
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            {created.user.fullName} logs in as {created.user.username}.
          </p>
          {created.generatedPassword !== null && (
            <PasswordSlip password={created.generatedPassword} />
          )}
        </div>
      )}
    </Modal>
  );
}

/** A-03. */
export function TeachersScreen() {
  const admin = useAdmin();
  const teachers = useUsers({ role: 'teacher', pageSize: 200 });
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Teachers"
        actions={
          may(admin.role, 'manageUsers') && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add teacher
            </Button>
          )
        }
      />
      {teachers.error !== null && <Problem>{problemOf(teachers.error)}</Problem>}
      {teachers.data !== undefined && (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableCaption className="sr-only">Teachers</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.data.items.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-semibold">{teacher.fullName}</TableCell>
                  <TableCell className="font-mono text-[13px] text-ink-muted">
                    {teacher.username}
                  </TableCell>
                  <TableCell>
                    {teacher.classes.length === 0
                      ? 'None yet'
                      : teacher.classes.map((taught) => `${taught.code} ${taught.name}`).join(', ')}
                  </TableCell>
                  <TableCell>
                    {teacher.subjects.length === 0 ? 'None yet' : teacher.subjects.join(', ')}
                  </TableCell>
                  <TableCell>
                    <AccountStatus account={teacher} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {teachers.data.items.length === 0 && (
            <p className="p-4 text-sm text-ink-muted">No teachers yet.</p>
          )}
        </div>
      )}
      <AddTeacherDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
