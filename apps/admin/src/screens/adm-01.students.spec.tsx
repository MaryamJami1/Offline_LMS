import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-01 on the Students screen (A-02): search, the class filter, today's seat
 * and each account's state, and adding a student with a first password shown
 * once for the slip. Attendance, average and present or absent need class
 * sessions and marks (LAB-03, MOD-08), so those columns stay hidden (05).
 */

function rowOf(name: string): HTMLElement {
  const cell = screen.getByRole('cell', { name });
  const row = cell.closest('tr');
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

async function studentsTable() {
  return screen.findByRole('table', { name: 'Students' });
}

describe('ADM-01 the Students screen (A-02)', () => {
  it('lists every student with ID, name, class, seat today and the state of the account', async () => {
    renderAdmin(loggedInAsAdmin(), '/students');
    const table = await studentsTable();

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['ID', 'Name', 'Class', "Today's seat", 'Status', 'Actions']);
    expect(await screen.findByText('5 shown')).toBeInTheDocument();
    expect(within(rowOf('Ayesha Khan')).getByText('S-1001')).toHaveClass('font-mono');
    expect(within(rowOf('Ayesha Khan')).getByText('B-12')).toBeInTheDocument();
    expect(within(rowOf('Ayesha Khan')).getByText('A1 · Lab 1')).toBeInTheDocument();
    expect(within(rowOf('Ayesha Khan')).getByText('Active')).toBeInTheDocument();
  });

  it('tells a student who has left their seat from one who has not come, and shows locked, inactive and first-login accounts', async () => {
    renderAdmin(loggedInAsAdmin(), '/students');
    await studentsTable();

    expect(within(rowOf('Bilal Ahmed')).getByText('B2 · Lab 1, logged out')).toBeInTheDocument();
    expect(within(rowOf('Hira Malik')).getByText('Not today')).toBeInTheDocument();
    expect(within(rowOf('Hira Malik')).getByText('Locked')).toBeInTheDocument();
    expect(within(rowOf('Omar Farooq')).getByText('Inactive')).toBeInTheDocument();
    expect(within(rowOf('Zainab Ali')).getByText('First login')).toBeInTheDocument();
  });

  it('hides the columns whose data is not built yet', async () => {
    renderAdmin(loggedInAsAdmin(), '/students');
    const table = await studentsTable();

    expect(
      within(table).queryByRole('columnheader', { name: 'Attendance' }),
    ).not.toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Average' })).not.toBeInTheDocument();
    expect(within(table).queryByText('Present')).not.toBeInTheDocument();
  });

  it('searches by name or student ID', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/students');
    await studentsTable();

    await view.user.type(screen.getByRole('searchbox', { name: 'Search students' }), 'S-1002');

    await waitFor(() =>
      expect(screen.queryByRole('cell', { name: 'Ayesha Khan' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('cell', { name: 'Bilal Ahmed' })).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
  });

  it('keeps the search box and class filter named for screen readers, with the labels out of view as in the prototype', async () => {
    renderAdmin(loggedInAsAdmin(), '/students');
    await studentsTable();

    expect(screen.getByRole('searchbox', { name: 'Search students' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Class' })).toBeInTheDocument();
    expect(screen.getByText('Search students', { selector: 'label' })).toHaveClass('sr-only');
    expect(screen.getByText('Class', { selector: 'label' })).toHaveClass('sr-only');
  });

  it('filters by class, keeping the class in the address', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/students');
    await studentsTable();

    await view.user.selectOptions(screen.getByRole('combobox', { name: 'Class' }), 'B-14');

    await waitFor(() =>
      expect(screen.queryByRole('cell', { name: 'Ayesha Khan' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('cell', { name: 'Omar Farooq' })).toBeInTheDocument();
    expect(screen.getByText('Class B-14 · 2 shown')).toBeInTheDocument();
    expect(view.router.state.location.search).toBe('?class=B-14');
  });

  it('opens on the class the address names, as Manage students on Classes does', async () => {
    renderAdmin(loggedInAsAdmin(), '/students?class=B-14');

    expect(await screen.findByText('Class B-14 · 2 shown')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('B-14');
  });

  it('adds a student, who gets the next student ID and a first password shown once', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api, '/students');
    await studentsTable();

    await view.user.click(screen.getByRole('button', { name: 'Add student' }));
    const dialog = screen.getByRole('dialog', { name: 'Add student' });
    await view.user.type(within(dialog).getByLabelText('Full name'), 'Sana Javed');
    await view.user.type(within(dialog).getByLabelText('Phone (optional)'), '0300-1234567');
    await view.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Class' }), 'B-12');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add student' }));

    expect(await within(dialog).findByText('Sana Javed is S-1006.')).toBeInTheDocument();
    expect(within(dialog).getByText('Kite-4821-lamp')).toHaveClass('font-mono');
    expect(within(dialog).getByText(/shown only this once/)).toBeInTheDocument();
    expect(api.world.accounts.find((account) => account.username === 'S-1006')).toMatchObject({
      fullName: 'Sana Javed',
      phone: '0300-1234567',
      classes: [{ code: 'B-12' }],
    });

    await view.user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('cell', { name: 'Sana Javed' })).toBeInTheDocument();
  });

  it('checks the form against the shared contract before sending, and keeps what was typed', async () => {
    const api = loggedInAsAdmin();
    const create = vi.spyOn(api, 'createUser');
    const view = renderAdmin(api, '/students');
    await studentsTable();

    await view.user.click(screen.getByRole('button', { name: 'Add student' }));
    const dialog = screen.getByRole('dialog', { name: 'Add student' });
    await view.user.type(within(dialog).getByLabelText('Phone (optional)'), 'call me');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add student' }));

    expect(within(dialog).getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Phone (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(dialog).getByLabelText('Phone (optional)')).toHaveValue('call me');
    expect(create).not.toHaveBeenCalled();
  });
});
