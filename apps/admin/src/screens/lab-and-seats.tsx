import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import type { DeviceView, LabSeat, LabView, UpdateDeviceRequest } from '@lingualab/shared';
import {
  Badge,
  Button,
  Card,
  SeatTile,
  SelectField,
  useToast,
  type SeatState,
} from '@lingualab/ui';
import { useAdminApi } from '../api/api-context.js';
import { keys, useDevices, useLabSeats, useLabs, useRefresh } from '../api/queries.js';
import { PageHeader } from '../layout/page-header.js';
import { problemOf, whenSeen } from '../lib/format.js';
import { Problem } from './problem.js';

/**
 * A-07. The seat map is drawn as the room is: the back row at the top and the
 * front of the room, where the teacher sits, at the bottom, as in the
 * prototype. Rows run A at the front.
 */

function stateOf(seat: LabSeat): SeatState {
  if (seat.device === null) {
    return 'no-pc';
  }
  if (seat.device.status !== 'online') {
    return 'offline';
  }
  return seat.occupied ? 'online' : 'empty';
}

/** Rows from the back of the room to the front, each in seat order. */
function rowsOf(seats: readonly LabSeat[]): { row: string; seats: LabSeat[] }[] {
  const rows = [...new Set(seats.map((seat) => seat.row))].sort().reverse();
  return rows.map((row) => ({
    row,
    seats: seats.filter((seat) => seat.row === row).sort((a, b) => a.position - b.position),
  }));
}

function byCode(
  a: { row: string; position: number },
  b: { row: string; position: number },
): number {
  return a.row.localeCompare(b.row) || a.position - b.position;
}

/** Each change to a PC, and what to say when it is done. */
function useChangePc() {
  const api = useAdminApi();
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      pc,
      change,
    }: {
      pc: { id: string };
      change: UpdateDeviceRequest;
      done: string;
    }) => api.updateDevice(pc.id, change),
    onSuccess: async (_changed, { done }) => {
      toast(done);
      await refresh(keys.labs, keys.allDevices);
    },
  });
}

function SeatMap({
  lab,
  seats,
  selected,
  onSelect,
}: {
  lab: LabView;
  seats: readonly LabSeat[];
  selected: string | null;
  onSelect: (seatId: string) => void;
}) {
  const aisles = new Set(lab.layout.aisles);
  return (
    <Card title="Seat map" className="min-w-0 flex-[2_1_520px]">
      <div className="flex flex-col gap-2 overflow-x-auto">
        {rowsOf(seats).map(({ row, seats: rowSeats }) => (
          <div key={row} role="group" aria-label={`Row ${row}`} className="flex items-center gap-2">
            <span aria-hidden="true" className="w-6 text-sm text-ink-muted">
              {row}
            </span>
            {rowSeats.flatMap((seat) => {
              const tile = (
                <SeatTile
                  key={seat.id}
                  seatCode={seat.code}
                  hostname={seat.device?.hostname}
                  studentName={seat.student?.fullName}
                  state={stateOf(seat)}
                  selected={seat.id === selected}
                  onSelect={() => onSelect(seat.id)}
                />
              );
              return aisles.has(seat.position)
                ? [
                    tile,
                    <span
                      key={`${seat.id}-walkway`}
                      data-walkway
                      aria-hidden="true"
                      className="w-6 shrink-0"
                    />,
                  ]
                : [tile];
            })}
          </div>
        ))}
        <div className="ml-8 rounded-control bg-muted py-1.5 text-center text-[13px] text-ink-muted">
          Front of room
        </div>
      </div>
    </Card>
  );
}

function Detail({
  term,
  children,
  mono = false,
}: {
  term: string;
  children: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-sm text-ink-muted">{term}</dt>
      <dd className={mono ? 'font-mono text-[13px] text-ink' : 'text-sm text-ink'}>{children}</dd>
    </>
  );
}

function SeatDetails({ seat, freePcs }: { seat: LabSeat; freePcs: readonly DeviceView[] }) {
  const change = useChangePc();
  const [choice, setChoice] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const device = seat.device;

  function bind() {
    const pc = freePcs.find((candidate) => candidate.id === choice);
    if (pc === undefined) {
      setProblem('Choose a PC first');
      return;
    }
    setProblem(undefined);
    change.mutate(
      {
        pc,
        change: { action: 'bind', seatId: seat.id },
        done: `${pc.hostname} bound to seat ${seat.code}`,
      },
      { onError: (error) => setProblem(problemOf(error)), onSuccess: () => setChoice('') },
    );
  }

  return (
    <Card title={`Seat ${seat.code}`}>
      {device === null ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">No PC is bound to this seat.</p>
          {freePcs.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No approved PC is free. Approve a new PC below, or take one off another seat.
            </p>
          ) : (
            <>
              <SelectField
                label="PC to bind"
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                error={problem}
              >
                <option value="">Choose a PC…</option>
                {freePcs.map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.hostname}
                  </option>
                ))}
              </SelectField>
              <div>
                <Button size="small" onClick={bind} disabled={change.isPending}>
                  Bind PC
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            {device.status === 'online' ? (
              <Badge tone="ok">Online</Badge>
            ) : (
              <Badge tone="muted">Offline</Badge>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <Detail term="PC name" mono>
              {device.hostname}
            </Detail>
            <Detail term="IP address" mono>
              {device.ip ?? 'Not known yet'}
            </Detail>
            <Detail term="App version" mono>
              {device.appVersion ?? 'Not known yet'}
            </Detail>
            <Detail term="Last seen">{whenSeen(device.lastSeenAt)}</Detail>
            <Detail term="Logged in now">
              {seat.student !== null
                ? `${seat.student.fullName} (${seat.student.username})`
                : seat.occupied
                  ? 'A student'
                  : 'Nobody'}
            </Detail>
          </dl>
          {problem !== undefined && <Problem>{problem}</Problem>}
          <div>
            <Button
              size="small"
              disabled={change.isPending}
              onClick={() =>
                change.mutate(
                  {
                    pc: device,
                    change: { action: 'bind', seatId: null },
                    done: `${device.hostname} taken off seat ${seat.code}`,
                  },
                  { onError: (error) => setProblem(problemOf(error)) },
                )
              }
            >
              Take PC off seat
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function WaitingPc({ pc, freeSeats }: { pc: DeviceView; freeSeats: readonly LabSeat[] }) {
  const change = useChangePc();
  const [seatId, setSeatId] = useState('');
  const [problem, setProblem] = useState<string | undefined>();

  function approve() {
    const seat = freeSeats.find((candidate) => candidate.id === seatId);
    if (seat === undefined) {
      setProblem('Choose a seat first');
      return;
    }
    setProblem(undefined);
    change.mutate(
      {
        pc,
        change: { action: 'approve', seatId: seat.id },
        done: `${pc.hostname} approved on seat ${seat.code}`,
      },
      { onError: (error) => setProblem(problemOf(error)) },
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-[13px] font-semibold text-ink">{pc.hostname}</span>
        <span className="font-mono text-[13px] text-ink-muted">{pc.mac}</span>
        {pc.ip !== null && <span className="font-mono text-[13px] text-ink-muted">{pc.ip}</span>}
      </div>
      <SelectField
        label={`Seat for ${pc.hostname}`}
        value={seatId}
        onChange={(event) => setSeatId(event.target.value)}
        error={problem}
      >
        <option value="">Choose a seat…</option>
        {freeSeats.map((seat) => (
          <option key={seat.id} value={seat.id}>
            {seat.code}
          </option>
        ))}
      </SelectField>
      <div>
        <Button
          size="small"
          variant="primary"
          aria-label={`Approve ${pc.hostname}`}
          onClick={approve}
          disabled={change.isPending}
        >
          Approve
        </Button>
      </div>
    </li>
  );
}

export function LabAndSeatsScreen() {
  const [search, setSearch] = useSearchParams();
  const labs = useLabs();
  const labList = labs.data?.items ?? [];
  const lab = labList.find((candidate) => candidate.id === search.get('lab')) ?? labList[0];
  const map = useLabSeats(lab?.id);
  const devices = useDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const failed = [labs, map, devices].find((query) => query.error !== null);
  const seats = map.data?.seats ?? [];
  const selected = seats.find((seat) => seat.id === selectedId);
  const freeSeats = seats.filter((seat) => seat.device === null).sort(byCode);
  const allPcs = devices.data?.items ?? [];
  const waiting = allPcs.filter((pc) => pc.status === 'waiting');
  const freePcs = allPcs.filter(
    (pc) => pc.seat === null && (pc.status === 'online' || pc.status === 'offline'),
  );

  return (
    <>
      <PageHeader
        title={lab === undefined ? 'Lab and seats' : `${lab.name} · seats and PCs`}
        subtitle="Each lab PC runs the student app and is bound to one seat. Click a seat for details."
        actions={
          labList.length > 0 && (
            <SelectField
              label="Lab"
              value={lab?.id ?? ''}
              onChange={(event) => {
                setSelectedId(null);
                setSearch({ lab: event.target.value });
              }}
            >
              {labList.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </SelectField>
          )
        }
      />
      {failed !== undefined && <Problem>{problemOf(failed.error)}</Problem>}
      {labs.data !== undefined && labList.length === 0 && (
        <p className="text-sm text-ink-muted">There are no labs yet.</p>
      )}
      {lab !== undefined && (
        <div className="flex flex-wrap items-start gap-4">
          {map.data !== undefined && (
            <SeatMap
              lab={map.data.lab}
              seats={seats}
              selected={selectedId}
              onSelect={setSelectedId}
            />
          )}
          <div className="flex min-w-[280px] flex-[1_1_300px] flex-col gap-4">
            {selected === undefined ? (
              <Card title="Seat">
                <p className="text-sm text-ink-muted">Choose a seat to see its PC.</p>
              </Card>
            ) : (
              <SeatDetails key={selected.id} seat={selected} freePcs={freePcs} />
            )}
            <Card title="New PCs waiting">
              {devices.data === undefined ? (
                <p className="text-sm text-ink-muted">Checking…</p>
              ) : waiting.length === 0 ? (
                <p className="text-sm text-ink-muted">No new PCs are waiting.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {waiting.map((pc) => (
                    <WaitingPc key={pc.id} pc={pc} freeSeats={freeSeats} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
