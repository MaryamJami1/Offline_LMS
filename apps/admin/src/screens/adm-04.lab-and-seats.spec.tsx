import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { NOW, buildWorld, loggedInAsAdmin, type FakeAdminApi } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-04 on Lab and seats (A-07): pick a lab, see its seat map in room order
 * with each PC's status and who sits there, read a PC's details, bind a PC to
 * a seat or take it off, and approve a new PC onto a free seat.
 */

beforeEach(() => {
  // Only the clock: "last seen" is worked out from now.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function labId(api: FakeAdminApi, name: string): string {
  return api.world.labs.find((lab) => lab.name === name)?.id ?? '';
}

async function seatMap() {
  return screen.findByRole('region', { name: 'Seat map' });
}

describe('ADM-04 Lab and seats (A-07)', () => {
  it('opens the first lab, and another from the lab picker', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/lab');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lab 1 · seats and PCs' }),
    ).toBeInTheDocument();

    await view.user.selectOptions(screen.getByRole('combobox', { name: 'Lab' }), 'Lab 2');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lab 2 · seats and PCs' }),
    ).toBeInTheDocument();
    expect(view.router.state.location.search).toContain('lab=');
  });

  it('opens the lab the address names', async () => {
    const api = loggedInAsAdmin();
    renderAdmin(api, `/lab?lab=${labId(api, 'Lab 2')}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lab 2 · seats and PCs' }),
    ).toBeInTheDocument();
  });

  it('draws the rows from the back of the room to the front, with each seat saying its PC and who sits there', async () => {
    renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    const rows = await within(map).findAllByRole('group');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Row B', 'Row A']);
    expect(within(map).getByText('Front of room')).toBeInTheDocument();

    expect(
      within(map).getByRole('button', { name: 'A1, PC LAB1-A1, Ayesha Khan, online' }),
    ).toBeInTheDocument();
    expect(
      within(map).getByRole('button', { name: 'A2, PC LAB1-A2, empty seat' }),
    ).toBeInTheDocument();
    expect(
      within(map).getByRole('button', { name: 'B1, PC LAB1-B1, PC offline' }),
    ).toBeInTheDocument();
    expect(within(map).getByRole('button', { name: 'A3, no PC' })).toBeInTheDocument();
  });

  it("draws compact seats, as the prototype's seat map does", async () => {
    renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    const seats = await within(map).findAllByRole('button', { name: /^[AB]\d,/ });
    expect(seats).toHaveLength(8);
    for (const seat of seats) {
      expect(seat).toHaveAttribute('data-size', 'compact');
    }
  });

  it('leaves a walkway where the layout has one', async () => {
    renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    const rowA = await within(map).findByRole('group', { name: 'Row A' });
    const walkways = rowA.querySelectorAll('[data-walkway]');
    expect(walkways).toHaveLength(1);
    expect(walkways[0]?.previousElementSibling).toHaveTextContent('A2');
  });

  it("shows a seat's PC and who is logged in there", async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    await view.user.click(within(map).getByRole('button', { name: /^A1,/ }));

    const details = screen.getByRole('region', { name: 'Seat A1' });
    expect(within(details).getByText('Online')).toBeInTheDocument();
    expect(within(details).getByText('LAB1-A1')).toBeInTheDocument();
    expect(within(details).getByText('192.168.10.121')).toBeInTheDocument();
    expect(within(details).getByText('1.0.0')).toBeInTheDocument();
    expect(within(details).getByText('Just now')).toBeInTheDocument();
    expect(within(details).getByText('Ayesha Khan (S-1001)')).toBeInTheDocument();
  });

  it('says when an offline PC was last seen, in Karachi time', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    await view.user.click(within(map).getByRole('button', { name: /^B1,/ }));

    const details = screen.getByRole('region', { name: 'Seat B1' });
    expect(within(details).getByText('Offline')).toBeInTheDocument();
    expect(within(details).getByText('4 Nov, 16:42')).toBeInTheDocument();
    expect(within(details).getByText('Nobody')).toBeInTheDocument();
  });

  it('opens a seat from the keyboard', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/lab');
    const map = await seatMap();

    within(map).getByRole('button', { name: /^A2,/ }).focus();
    await view.user.keyboard('{Enter}');

    expect(screen.getByRole('region', { name: 'Seat A2' })).toBeInTheDocument();
  });

  it('takes a PC off its seat', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api, '/lab');
    const map = await seatMap();
    await view.user.click(within(map).getByRole('button', { name: /^A2,/ }));

    await view.user.click(screen.getByRole('button', { name: 'Take PC off seat' }));

    expect(await screen.findByText('LAB1-A2 taken off seat A2')).toBeInTheDocument();
    expect(await within(map).findByRole('button', { name: 'A2, no PC' })).toBeInTheDocument();
  });

  it('binds an approved PC to a seat with none, and explains a seat with no PC', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api, '/lab');
    const map = await seatMap();
    await view.user.click(within(map).getByRole('button', { name: 'A3, no PC' }));

    const details = screen.getByRole('region', { name: 'Seat A3' });
    expect(within(details).getByText('No PC is bound to this seat.')).toBeInTheDocument();
    const choice = within(details).getByRole('combobox', { name: 'PC to bind' });
    expect(
      within(choice)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a PC…', 'SPARE-PC']);

    await view.user.selectOptions(choice, 'SPARE-PC');
    await view.user.click(within(details).getByRole('button', { name: 'Bind PC' }));

    expect(await screen.findByText('SPARE-PC bound to seat A3')).toBeInTheDocument();
    expect(
      await within(map).findByRole('button', { name: 'A3, PC SPARE-PC, PC offline' }),
    ).toBeInTheDocument();
  });

  it('approves a new PC onto a free seat of this lab', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api, '/lab');
    const map = await seatMap();

    const waiting = screen.getByRole('region', { name: 'New PCs waiting' });
    expect(await within(waiting).findByText('NEW-PC-07')).toBeInTheDocument();
    expect(within(waiting).getByText('192.168.10.150')).toBeInTheDocument();
    const seat = within(waiting).getByRole('combobox', { name: 'Seat for NEW-PC-07' });
    expect(
      within(seat)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a seat…', 'A3', 'A4', 'B2', 'B3', 'B4']);

    await view.user.selectOptions(seat, 'A4');
    await view.user.click(within(waiting).getByRole('button', { name: 'Approve NEW-PC-07' }));

    expect(await screen.findByText('NEW-PC-07 approved on seat A4')).toBeInTheDocument();
    expect(await within(waiting).findByText('No new PCs are waiting.')).toBeInTheDocument();
    expect(
      await within(map).findByRole('button', { name: 'A4, PC NEW-PC-07, empty seat' }),
    ).toBeInTheDocument();
  });

  it('asks for a seat before approving', async () => {
    const api = loggedInAsAdmin();
    const spy = vi.spyOn(api, 'updateDevice');
    const view = renderAdmin(api, '/lab');
    const waiting = await screen.findByRole('region', { name: 'New PCs waiting' });

    await view.user.click(
      await within(waiting).findByRole('button', { name: 'Approve NEW-PC-07' }),
    );

    expect(
      within(waiting).getByRole('combobox', { name: 'Seat for NEW-PC-07' }),
    ).toHaveAccessibleDescription('Choose a seat first');
    expect(spy).not.toHaveBeenCalled();
  });

  it("says the server's reason when the seat was taken meanwhile", async () => {
    const world = buildWorld();
    const api = loggedInAsAdmin(world);
    const view = renderAdmin(api, '/lab');
    const waiting = await screen.findByRole('region', { name: 'New PCs waiting' });
    await view.user.selectOptions(
      await within(waiting).findByRole('combobox', { name: 'Seat for NEW-PC-07' }),
      'A4',
    );

    // Another admin binds the spare PC to A4 first.
    const a4 = world.seats.find((seat) => seat.code === 'A4' && seat.labId === labId(api, 'Lab 1'));
    const spare = world.devices.find((pc) => pc.hostname === 'SPARE-PC');
    if (spare !== undefined && a4 !== undefined) {
      spare.seat = { id: a4.id, code: 'A4', labId: a4.labId, labName: 'Lab 1' };
    }
    await view.user.click(within(waiting).getByRole('button', { name: 'Approve NEW-PC-07' }));

    expect(await screen.findByText('SPARE-PC is already on A4')).toBeInTheDocument();
  });
});
