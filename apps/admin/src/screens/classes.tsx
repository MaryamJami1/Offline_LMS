import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import {
  WEEKDAYS,
  createClassRequestSchema,
  may,
  type ClassView,
  type CreateClassRequest,
  type Schedule,
} from '@lingualab/shared';
import {
  Badge,
  Button,
  Card,
  CheckboxGroup,
  Modal,
  SelectField,
  TextField,
  useToast,
} from '@lingualab/ui';
import { useAdminApi } from '../api/api-context.js';
import { keys, useBatches, useClasses, useLabs, useRefresh, useUsers } from '../api/queries.js';
import { useAdmin } from '../auth/session.js';
import { PageHeader } from '../layout/page-header.js';
import { problemOf } from '../lib/format.js';
import { check, problemsOfError, type FormProblems } from '../lib/form-problems.js';
import { Problem } from './problem.js';

const DAY_NAMES: Record<(typeof WEEKDAYS)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** "Mon to Thu, 10:00" for a run of days; "Mon and Wed, 17:00" otherwise. */
export function scheduleText(schedule: Schedule | null): string {
  if (schedule === null) {
    return 'No schedule yet';
  }
  const order = schedule.days.map((day) => WEEKDAYS.indexOf(day)).sort((a, b) => a - b);
  const names = order.map((index) => DAY_NAMES[WEEKDAYS[index] ?? 'mon']);
  const consecutive = order.every(
    (day, index) => index === 0 || day === (order[index - 1] ?? 0) + 1,
  );
  let days: string;
  if (names.length >= 3 && consecutive) {
    days = `${names[0]} to ${names[names.length - 1]}`;
  } else if (names.length === 1) {
    days = names[0] ?? '';
  } else {
    days = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${days}, ${schedule.start}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function ClassCard({ taught }: { taught: ClassView }) {
  const teachers =
    taught.teachers.length === 0
      ? 'No teacher yet'
      : taught.teachers.map((teacher) => teacher.fullName).join(', ');
  return (
    <Card title={`${taught.code} · ${taught.name}`}>
      <div>
        <Badge tone="info">Batch {taught.batch.name}</Badge>
      </div>
      <span className="text-sm text-ink-muted">
        {teachers} · {taught.lab.name} · {scheduleText(taught.schedule)}
      </span>
      <span className="text-sm text-ink">
        {plural(taught.studentCount, 'student')} · {plural(taught.groupCount, 'group')}
      </span>
      <div>
        <Button size="small" asChild>
          <Link
            to={`/students?class=${encodeURIComponent(taught.code)}`}
            aria-label={`Manage students of ${taught.code}`}
          >
            Manage students
          </Link>
        </Button>
      </div>
    </Card>
  );
}

const DEFAULT_MINUTES = '90';

function NewClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdminApi();
  const refresh = useRefresh();
  const toast = useToast();
  const batches = useBatches();
  const labs = useLabs();
  const teachers = useUsers({ role: 'teacher', pageSize: 200 });
  const formId = useId();
  const [days, setDays] = useState<string[]>([]);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [problems, setProblems] = useState<FormProblems>({});
  const create = useMutation({
    mutationFn: (request: CreateClassRequest) => api.createClass(request),
    onSuccess: async (created) => {
      toast(`Class ${created.code} created`);
      close();
      await refresh(keys.classes, keys.allUsers);
    },
    onError: (error) =>
      setProblems(
        problemsOfError(error, {
          CLASS_CODE_TAKEN: 'code',
          BATCH_NOT_FOUND: 'batchId',
          LAB_NOT_FOUND: 'labRoomId',
          TEACHER_NOT_FOUND: 'teacherIds',
        }),
      ),
  });

  function close() {
    setDays([]);
    setTeacherIds([]);
    setProblems({});
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get('start') ?? '');
    // No days and no time: the class has no schedule yet. Anything more is a schedule to check.
    const schedule =
      days.length === 0 && start === ''
        ? undefined
        : { days, start, minutes: Number(form.get('minutes') ?? DEFAULT_MINUTES) };
    const checked = check(createClassRequestSchema, {
      code: String(form.get('code') ?? ''),
      name: String(form.get('name') ?? ''),
      batchId: String(form.get('batchId') ?? ''),
      labRoomId: String(form.get('labRoomId') ?? ''),
      ...(schedule === undefined ? {} : { schedule }),
      ...(teacherIds.length === 0 ? {} : { teacherIds }),
    });
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    // The code is sent as typed; the server keeps it in capitals (04).
    create.mutate({ ...checked.value, code: String(form.get('code') ?? '').trim() });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title="New class"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={create.isPending}>
            Create class
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto"
        onSubmit={submit}
        noValidate
      >
        {problems.form !== undefined && <Problem>{problems.form}</Problem>}
        <TextField
          label="Code"
          name="code"
          hint="Like B-12"
          autoComplete="off"
          error={problems['code']}
        />
        <TextField label="Name" name="name" autoComplete="off" error={problems['name']} />
        <SelectField
          label="Batch"
          name="batchId"
          defaultValue=""
          error={problems['batchId'] === undefined ? undefined : 'Choose a batch'}
        >
          <option value="">Choose a batch…</option>
          {(batches.data?.items ?? []).map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.courseName} · {batch.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lab"
          name="labRoomId"
          defaultValue=""
          error={problems['labRoomId'] === undefined ? undefined : 'Choose a lab'}
        >
          <option value="">Choose a lab…</option>
          {(labs.data?.items ?? []).map((lab) => (
            <option key={lab.id} value={lab.id}>
              {lab.name}
            </option>
          ))}
        </SelectField>
        <CheckboxGroup
          legend="Days"
          options={WEEKDAYS.map((day) => ({ value: day, label: DAY_NAMES[day] }))}
          value={days}
          onChange={setDays}
          error={problems['schedule.days']}
        />
        <div className="flex flex-wrap gap-3">
          <TextField
            label="Start time"
            name="start"
            type="time"
            error={problems['schedule.start']}
          />
          <TextField
            label="Length in minutes"
            name="minutes"
            type="number"
            min={15}
            max={480}
            defaultValue={DEFAULT_MINUTES}
            error={problems['schedule.minutes']}
          />
        </div>
        <CheckboxGroup
          legend="Teachers"
          options={(teachers.data?.items ?? []).map((teacher) => ({
            value: teacher.id,
            label: teacher.fullName,
          }))}
          value={teacherIds}
          onChange={setTeacherIds}
          error={problems['teacherIds']}
        />
      </form>
    </Modal>
  );
}

/** A-04. Courses and batches are made by the API for now; their screens come later. */
export function ClassesScreen() {
  const admin = useAdmin();
  const classes = useClasses();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Classes and batches"
        actions={
          may(admin.role, 'manageOrganisation') && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              New class
            </Button>
          )
        }
      />
      {classes.error !== null && <Problem>{problemOf(classes.error)}</Problem>}
      {classes.data !== undefined && classes.data.items.length === 0 && (
        <p className="text-sm text-ink-muted">No classes yet.</p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
        {(classes.data?.items ?? []).map((taught) => (
          <ClassCard key={taught.id} taught={taught} />
        ))}
      </div>
      <NewClassDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
