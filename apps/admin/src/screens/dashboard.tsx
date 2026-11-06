import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, Card } from '@lingualab/ui';
import { useAllLabSeats, useClasses, useDevices, useLabs, useUsers } from '../api/queries.js';
import { PageHeader } from '../layout/page-header.js';
import { instituteDay, problemOf } from '../lib/format.js';
import { Problem } from './problem.js';

/**
 * A-01. Only what the server can already say: the Lessons card, "In the lab
 * now" and submissions to mark come with MOD-05, LAB-01 and MOD-07 (05).
 */

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Total({ title, value, note }: { title: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card title={title}>
      <span className="text-[30px] leading-tight font-bold text-ink">{value}</span>
      {note !== undefined && <span className="text-sm text-ink-muted">{note}</span>}
    </Card>
  );
}

function Attention({ text, to }: { text: string; to: string }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm text-ink">
      <span>{text}</span>
      <Button size="small" asChild>
        <Link to={to} aria-label={`View: ${text}`}>
          View
        </Link>
      </Button>
    </li>
  );
}

export function DashboardScreen() {
  const students = useUsers({ role: 'student', pageSize: 1 });
  const teachers = useUsers({ role: 'teacher', pageSize: 200 });
  const classes = useClasses();
  const labs = useLabs();
  const labList = labs.data?.items ?? [];
  const seatMaps = useAllLabSeats(labList.map((lab) => lab.id));
  const waiting = useDevices('waiting');

  const failed = [students, teachers, classes, labs, waiting, ...seatMaps].find(
    (query) => query.error !== null,
  );
  if (failed !== undefined) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={instituteDay(new Date())} />
        <Problem>{problemOf(failed.error)}</Problem>
      </>
    );
  }

  const teacherList = teachers.data?.items ?? [];
  const activeTeachers = teacherList.filter((teacher) => teacher.status === 'active').length;
  const offline = seatMaps.flatMap((query) =>
    (query.data?.seats ?? [])
      .filter((seat) => seat.device?.status === 'offline')
      .map((seat) => ({ lab: query.data?.lab, code: seat.code })),
  );
  const offlineByLab = labList
    .map((lab) => ({
      lab,
      codes: offline.filter((entry) => entry.lab?.id === lab.id).map((entry) => entry.code),
    }))
    .filter((entry) => entry.codes.length > 0);
  const waitingCount = waiting.data?.items.length ?? 0;
  const ready = seatMaps.every((query) => query.data !== undefined) && waiting.data !== undefined;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={instituteDay(new Date())} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <Total
          title="Students"
          value={students.data?.total ?? '…'}
          note={
            classes.data === undefined
              ? undefined
              : `in ${plural(classes.data.items.length, 'class', 'classes')}`
          }
        />
        <Total
          title="Teachers"
          value={teachers.data?.total ?? '…'}
          note={
            teachers.data === undefined
              ? undefined
              : activeTeachers === teacherList.length
                ? 'all active'
                : `${activeTeachers} active`
          }
        />
        <Total title="Classes" value={classes.data?.items.length ?? '…'} />
        {labList.map((lab, index) => {
          const map = seatMaps[index]?.data;
          const pcs = map?.seats.filter((seat) => seat.device !== null) ?? [];
          const online = pcs.filter((seat) => seat.device?.status === 'online').length;
          return (
            <Total
              key={lab.id}
              title={`${lab.name} PCs`}
              value={
                map === undefined
                  ? '…'
                  : pcs.length === 0
                    ? 'No PCs yet'
                    : `${online} / ${pcs.length}`
              }
              note={pcs.length === 0 ? undefined : 'online now'}
            />
          );
        })}
      </div>
      <div className="max-w-xl">
        <Card title="Needs attention">
          {!ready ? (
            <p className="text-sm text-ink-muted">Checking…</p>
          ) : offlineByLab.length === 0 && waitingCount === 0 ? (
            <p className="text-sm text-ink-muted">Nothing needs attention.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {offlineByLab.map(({ lab, codes }) => (
                <Attention
                  key={lab.id}
                  text={`${plural(codes.length, 'lab PC')} offline (${lab.name}: ${codes.join(', ')})`}
                  to={`/lab?lab=${lab.id}`}
                />
              ))}
              {waitingCount > 0 && (
                <Attention
                  text={`${plural(waitingCount, 'new PC')} waiting for approval`}
                  to="/lab"
                />
              )}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
