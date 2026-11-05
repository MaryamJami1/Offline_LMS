import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router';
import { may, type AdminUser } from '@lingualab/shared';
import {
  Badge,
  Button,
  SelectField,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextField,
} from '@lingualab/ui';
import { useClasses, useUsers } from '../api/queries.js';
import { useAdmin } from '../auth/session.js';
import { PageHeader } from '../layout/page-header.js';
import { problemOf } from '../lib/format.js';
import { AccountStatus } from './account-status.js';
import { Problem } from './problem.js';
import { AddStudentDialog, ImportDialog, ResetPasswordDialog } from './student-dialogs.js';

/** The most the server lists at once (04). */
const PAGE_SIZE = 200;

function SeatToday({ student }: { student: AdminUser }) {
  const seat = student.seatToday;
  if (seat === null) {
    return <span className="text-ink-muted">Not today</span>;
  }
  return (
    <span className="font-mono text-[13px]">
      {seat.seatCode} · {seat.labName}
      {!seat.loggedIn && ', logged out'}
    </span>
  );
}

/**
 * A-02. Attendance, average and present or absent come with LAB-03 and
 * MOD-08; until then the Status column is the account's own state (05).
 */
export function StudentsScreen() {
  const admin = useAdmin();
  const [search, setSearch] = useSearchParams();
  const classCode = search.get('class') ?? undefined;
  const [typed, setTyped] = useState('');
  const q = useDeferredValue(typed.trim());
  const students = useUsers({
    role: 'student',
    pageSize: PAGE_SIZE,
    ...(q === '' ? {} : { q }),
    ...(classCode === undefined ? {} : { classCode }),
  });
  const classes = useClasses();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const items = students.data?.items ?? [];
  const shown = `${items.length} shown`;

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={
          students.data === undefined
            ? ' '
            : classCode === undefined
              ? shown
              : `Class ${classCode} · ${shown}`
        }
        actions={
          <>
            {may(admin.role, 'importStudents') && (
              <Button onClick={() => setImporting(true)}>Import from Excel</Button>
            )}
            {may(admin.role, 'manageUsers') && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add student
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="max-w-[420px] flex-[1_1_280px]">
          <TextField
            label="Search students"
            type="search"
            placeholder="Search by name or ID"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <div className="min-w-[220px]">
          <SelectField
            label="Class"
            value={classCode ?? ''}
            onChange={(event) =>
              setSearch(event.target.value === '' ? {} : { class: event.target.value })
            }
          >
            <option value="">All classes</option>
            {(classes.data?.items ?? []).map((taught) => (
              <option key={taught.id} value={taught.code}>
                {taught.code} · {taught.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {students.error !== null && <Problem>{problemOf(students.error)}</Problem>}
      {students.data !== undefined && (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <TableCaption className="sr-only">Students</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Today's seat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-mono text-[13px] text-ink-muted">
                    {student.username}
                  </TableCell>
                  <TableCell className="font-semibold">{student.fullName}</TableCell>
                  <TableCell>
                    {student.classes.length === 0 ? (
                      <Badge tone="muted">No class</Badge>
                    ) : (
                      student.classes.map((taken) => taken.code).join(', ')
                    )}
                  </TableCell>
                  <TableCell>
                    <SeatToday student={student} />
                  </TableCell>
                  <TableCell>
                    <AccountStatus account={student} />
                  </TableCell>
                  <TableCell>
                    {may(admin.role, 'resetStudentPassword') && (
                      <Button
                        size="small"
                        aria-label={`Reset password for ${student.fullName}`}
                        onClick={() => setResetting(student)}
                      >
                        Reset password
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.length === 0 && <p className="p-4 text-sm text-ink-muted">No students match.</p>}
          {students.data.total > items.length && (
            <p className="p-4 text-sm text-ink-muted">
              Showing the first {items.length} of {students.data.total}. Search or pick a class to
              see the rest.
            </p>
          )}
        </div>
      )}
      <AddStudentDialog open={adding} onClose={() => setAdding(false)} classCode={classCode} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ResetPasswordDialog student={resetting} onClose={() => setResetting(null)} />
    </>
  );
}
