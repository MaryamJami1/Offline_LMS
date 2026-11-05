import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-03 on the Classes screen (A-04): a card per class with its batch,
 * teachers, lab, schedule, students and groups; Manage students opens the
 * class's students; New class checks the form against the shared contract.
 */

async function card(name: string) {
  return screen.findByRole('region', { name });
}

describe('ADM-03 the Classes screen (A-04)', () => {
  it('shows each class with its batch, teachers, lab, schedule, students and groups', async () => {
    renderAdmin(loggedInAsAdmin(), '/classes');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Classes and batches' }),
    ).toBeInTheDocument();
    const b12 = await card('B-12 · Spoken English');
    expect(within(b12).getByText('Batch Fall 2026')).toBeInTheDocument();
    expect(within(b12).getByText('Sara Iqbal · Lab 1 · Mon to Thu, 10:00')).toBeInTheDocument();
    expect(within(b12).getByText('3 students · 1 group')).toBeInTheDocument();

    const b14 = await card('B-14 · Evening Grammar');
    expect(within(b14).getByText('No teacher yet · Lab 1 · No schedule yet')).toBeInTheDocument();
    expect(within(b14).getByText('2 students · 0 groups')).toBeInTheDocument();
  });

  it("opens the class's students from Manage students", async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/classes');
    const b14 = await card('B-14 · Evening Grammar');

    await view.user.click(within(b14).getByRole('link', { name: 'Manage students of B-14' }));

    expect(await screen.findByText('Class B-14 · 2 shown')).toBeInTheDocument();
    expect(view.router.state.location.search).toBe('?class=B-14');
  });

  it('creates a class with a batch, lab, schedule and teacher', async () => {
    const api = loggedInAsAdmin();
    const create = vi.spyOn(api, 'createClass');
    const view = renderAdmin(api, '/classes');
    await card('B-12 · Spoken English');

    await view.user.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = screen.getByRole('dialog', { name: 'New class' });
    await view.user.type(within(dialog).getByLabelText('Code'), 'b-20');
    await view.user.type(within(dialog).getByLabelText('Name'), 'Business English');
    await view.user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Batch' }),
      'Spoken English · Fall 2026',
    );
    await view.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Lab' }), 'Lab 1');
    const days = within(dialog).getByRole('group', { name: 'Days' });
    await view.user.click(within(days).getByRole('checkbox', { name: 'Wed' }));
    await view.user.click(within(days).getByRole('checkbox', { name: 'Mon' }));
    await view.user.type(within(dialog).getByLabelText('Start time'), '17:00');
    await view.user.clear(within(dialog).getByLabelText('Length in minutes'));
    await view.user.type(within(dialog).getByLabelText('Length in minutes'), '60');
    const teachers = within(dialog).getByRole('group', { name: 'Teachers' });
    await view.user.click(await within(teachers).findByRole('checkbox', { name: 'Sara Iqbal' }));
    await view.user.click(within(dialog).getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('Class B-20 created')).toBeInTheDocument();
    const created = await card('B-20 · Business English');
    expect(
      within(created).getByText('Sara Iqbal · Lab 1 · Mon and Wed, 17:00'),
    ).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'b-20',
        schedule: { days: ['mon', 'wed'], start: '17:00', minutes: 60 },
        teacherIds: [expect.any(String)],
      }),
    );
  });

  it('leaves the schedule out when no day is ticked and no time given', async () => {
    const api = loggedInAsAdmin();
    const create = vi.spyOn(api, 'createClass');
    const view = renderAdmin(api, '/classes');
    await card('B-12 · Spoken English');

    await view.user.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = screen.getByRole('dialog', { name: 'New class' });
    await view.user.type(within(dialog).getByLabelText('Code'), 'B-21');
    await view.user.type(within(dialog).getByLabelText('Name'), 'Weekend');
    await view.user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Batch' }),
      'Spoken English · Fall 2026',
    );
    await view.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Lab' }), 'Lab 1');
    await view.user.click(within(dialog).getByRole('button', { name: 'Create class' }));

    expect(await card('B-21 · Weekend')).toBeInTheDocument();
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('schedule');
  });

  it('asks for a start time when days are ticked, without sending', async () => {
    const api = loggedInAsAdmin();
    const create = vi.spyOn(api, 'createClass');
    const view = renderAdmin(api, '/classes');
    await card('B-12 · Spoken English');

    await view.user.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = screen.getByRole('dialog', { name: 'New class' });
    await view.user.type(within(dialog).getByLabelText('Code'), 'B-22');
    await view.user.type(within(dialog).getByLabelText('Name'), 'Evening');
    await view.user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Batch' }),
      'Spoken English · Fall 2026',
    );
    await view.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Lab' }), 'Lab 1');
    await view.user.click(
      within(within(dialog).getByRole('group', { name: 'Days' })).getByRole('checkbox', {
        name: 'Fri',
      }),
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Create class' }));

    expect(within(dialog).getByLabelText('Start time')).toHaveAttribute('aria-invalid', 'true');
    expect(create).not.toHaveBeenCalled();
  });

  it('says a taken code next to the Code field', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/classes');
    await card('B-12 · Spoken English');

    await view.user.click(screen.getByRole('button', { name: 'New class' }));
    const dialog = screen.getByRole('dialog', { name: 'New class' });
    await view.user.type(within(dialog).getByLabelText('Code'), 'B-12');
    await view.user.type(within(dialog).getByLabelText('Name'), 'Again');
    await view.user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Batch' }),
      'Spoken English · Fall 2026',
    );
    await view.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Lab' }), 'Lab 1');
    await view.user.click(within(dialog).getByRole('button', { name: 'Create class' }));

    expect(await within(dialog).findByText('That code is taken')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
  });
});
