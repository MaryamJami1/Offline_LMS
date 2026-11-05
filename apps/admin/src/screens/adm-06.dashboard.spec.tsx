import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { buildWorld, loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-06, the dashboard (A-01): totals, each lab's PCs online, and what needs
 * the admin. Cards whose data comes with later requirements (Lessons, In the
 * lab now, submissions to mark) stay hidden until then (05), rather than
 * showing numbers that are not real.
 */

describe('ADM-06 the dashboard (A-01)', () => {
  it('shows how many students, teachers and classes there are', async () => {
    renderAdmin(loggedInAsAdmin());

    const students = await screen.findByRole('region', { name: 'Students' });
    expect(await within(students).findByText('5')).toBeInTheDocument();
    expect(await within(students).findByText('in 2 classes')).toBeInTheDocument();

    const teachers = screen.getByRole('region', { name: 'Teachers' });
    expect(await within(teachers).findByText('2')).toBeInTheDocument();
    expect(within(teachers).getByText('all active')).toBeInTheDocument();

    const classes = screen.getByRole('region', { name: 'Classes' });
    expect(await within(classes).findByText('2')).toBeInTheDocument();
  });

  it("counts each lab's PCs online now, and says when a lab has none yet", async () => {
    renderAdmin(loggedInAsAdmin());

    const lab1 = await screen.findByRole('region', { name: 'Lab 1 PCs' });
    expect(await within(lab1).findByText('2 / 3')).toBeInTheDocument();
    expect(within(lab1).getByText('online now')).toBeInTheDocument();

    const lab2 = screen.getByRole('region', { name: 'Lab 2 PCs' });
    expect(await within(lab2).findByText('No PCs yet')).toBeInTheDocument();
  });

  it('lists offline PCs by seat and new PCs waiting, each with a way to the seat map', async () => {
    const view = renderAdmin(loggedInAsAdmin());

    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    expect(await within(attention).findByText('1 lab PC offline (Lab 1: B1)')).toBeInTheDocument();
    expect(within(attention).getByText('1 new PC waiting for approval')).toBeInTheDocument();

    const [offlineView] = within(attention).getAllByRole('link', { name: /^View/ });
    await view.user.click(offlineView as HTMLElement);
    expect(
      await screen.findByRole('heading', { level: 1, name: /seats and PCs/ }),
    ).toBeInTheDocument();
  });

  it('says so when nothing needs attention', async () => {
    const world = buildWorld();
    world.devices = world.devices.filter((pc) => pc.status === 'online');
    renderAdmin(loggedInAsAdmin(world));

    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    expect(await within(attention).findByText('Nothing needs attention.')).toBeInTheDocument();
  });

  it('hides the cards whose data is not built yet', async () => {
    renderAdmin(loggedInAsAdmin());
    await screen.findByRole('region', { name: 'Students' });

    expect(screen.queryByRole('region', { name: 'Lessons' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'In the lab now' })).not.toBeInTheDocument();
    expect(screen.queryByText(/submissions to mark/)).not.toBeInTheDocument();
  });

  it('says what went wrong when the server cannot be reached', async () => {
    const api = loggedInAsAdmin();
    api.listLabs = () => Promise.reject(new TypeError('Failed to fetch'));
    renderAdmin(api);

    expect(
      await screen.findByText('The server cannot be reached. Check the network and try again.'),
    ).toBeInTheDocument();
  });
});
