import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-01 on the Teachers screen (A-03): the list of teachers with their
 * classes and modules, and adding one with a first password shown once.
 */

describe('ADM-01 the Teachers screen (A-03)', () => {
  it('lists teachers with username, classes, modules and status', async () => {
    renderAdmin(loggedInAsAdmin(), '/teachers');
    const table = await screen.findByRole('table', { name: 'Teachers' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Name', 'Username', 'Classes', 'Modules', 'Status']);
    const row = within(table)
      .getByRole('cell', { name: 'Sara Iqbal' })
      .closest('tr') as HTMLElement;
    expect(within(row).getByText('sara.iqbal')).toHaveClass('font-mono');
    expect(within(row).getByText('B-12 Spoken English')).toBeInTheDocument();
    expect(within(row).getByText('Speaking, Listening')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(table).queryByRole('cell', { name: 'Ayesha Khan' })).not.toBeInTheDocument();
  });

  it('adds a teacher with modules and classes, and shows the first password once', async () => {
    const api = loggedInAsAdmin();
    const view = renderAdmin(api, '/teachers');
    await screen.findByRole('table', { name: 'Teachers' });

    await view.user.click(screen.getByRole('button', { name: 'Add teacher' }));
    const dialog = screen.getByRole('dialog', { name: 'Add teacher' });
    await view.user.type(within(dialog).getByLabelText('Full name'), 'Nida Akram');
    await view.user.type(within(dialog).getByLabelText('Username'), 'n.akram');
    const modules = within(dialog).getByRole('group', { name: 'Modules' });
    await view.user.click(within(modules).getByRole('checkbox', { name: 'Reading' }));
    await view.user.click(within(modules).getByRole('checkbox', { name: 'Speaking' }));
    const classes = within(dialog).getByRole('group', { name: 'Classes' });
    await view.user.click(
      await within(classes).findByRole('checkbox', { name: 'B-14 · Evening Grammar' }),
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Add teacher' }));

    expect(await within(dialog).findByText('Nida Akram logs in as n.akram.')).toBeInTheDocument();
    expect(within(dialog).getByText('Kite-4821-lamp')).toBeInTheDocument();
    expect(api.world.accounts.find((account) => account.username === 'n.akram')).toMatchObject({
      role: 'teacher',
      subjects: ['Speaking', 'Reading'],
      classes: [{ code: 'B-14' }],
    });

    await view.user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('cell', { name: 'Nida Akram' })).toBeInTheDocument();
  });

  it('says a taken username next to the Username field', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/teachers');
    await screen.findByRole('table', { name: 'Teachers' });

    await view.user.click(screen.getByRole('button', { name: 'Add teacher' }));
    const dialog = screen.getByRole('dialog', { name: 'Add teacher' });
    await view.user.type(within(dialog).getByLabelText('Full name'), 'Sara Iqbal');
    await view.user.type(within(dialog).getByLabelText('Username'), 'sara.iqbal');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add teacher' }));

    expect(await within(dialog).findByText('That username is already in use')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Full name')).toHaveValue('Sara Iqbal');
  });

  it('needs a username before sending, since a teacher has no student ID', async () => {
    const api = loggedInAsAdmin();
    const create = vi.spyOn(api, 'createUser');
    const view = renderAdmin(api, '/teachers');
    await screen.findByRole('table', { name: 'Teachers' });

    await view.user.click(screen.getByRole('button', { name: 'Add teacher' }));
    const dialog = screen.getByRole('dialog', { name: 'Add teacher' });
    await view.user.type(within(dialog).getByLabelText('Full name'), 'Nida Akram');
    await view.user.click(within(dialog).getByRole('button', { name: 'Add teacher' }));

    expect(within(dialog).getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(create).not.toHaveBeenCalled();
  });
});
