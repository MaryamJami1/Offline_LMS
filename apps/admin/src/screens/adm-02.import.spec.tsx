import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ApiError } from '../api/client.js';
import { fakeId, loggedInAsAdmin } from '../test/fake-api.js';
import { renderAdmin } from '../test/render-admin.js';

/**
 * ADM-02 on the Students screen (A-02): import students from an Excel or CSV
 * file, see each created student with the first password for their slip, and
 * each refused row by its row number in the file.
 */

const FILE = new File(['name,class,phone\nSana Javed,B-12,\n'], 'students.csv', {
  type: 'text/csv',
});

async function openImport(view: ReturnType<typeof renderAdmin>) {
  await screen.findByRole('table', { name: 'Students' });
  await view.user.click(screen.getByRole('button', { name: 'Import from Excel' }));
  return screen.getByRole('dialog', { name: 'Import students' });
}

describe('ADM-02 importing students (A-02)', () => {
  it('says which columns the file needs', async () => {
    const view = renderAdmin(loggedInAsAdmin(), '/students');
    const dialog = await openImport(view);

    expect(within(dialog).getByLabelText('Excel or CSV file')).toHaveAccessibleDescription(
      'Columns: name, class, phone. At most 1000 students.',
    );
  });

  it('creates the good rows, shows their first passwords, and lists the refused rows by number', async () => {
    const api = loggedInAsAdmin();
    api.world.nextImport = {
      created: [
        {
          row: 2,
          id: fakeId(),
          username: 'S-1006',
          fullName: 'Sana Javed',
          classCode: 'B-12',
          password: 'Pine-1111-road',
        },
        {
          row: 3,
          id: fakeId(),
          username: 'S-1007',
          fullName: 'Saad Qureshi',
          classCode: 'B-12',
          password: 'Lake-2222-sand',
        },
      ],
      errors: [
        { row: 4, field: 'class', code: 'CLASS_NOT_FOUND', message: 'There is no class B-99' },
      ],
      counts: { rows: 3, created: 2, rejected: 1 },
    };
    const view = renderAdmin(api, '/students');
    const dialog = await openImport(view);

    await view.user.upload(within(dialog).getByLabelText('Excel or CSV file'), FILE);
    await view.user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(
      await within(dialog).findByText('2 students created, 1 row refused.'),
    ).toBeInTheDocument();
    const created = within(dialog).getByRole('table', { name: 'Students created' });
    expect(within(created).getByRole('cell', { name: 'Pine-1111-road' })).toBeInTheDocument();
    expect(within(created).getByRole('cell', { name: 'S-1007' })).toBeInTheDocument();
    const refused = within(dialog).getByRole('table', { name: 'Rows refused' });
    expect(
      within(refused).getByRole('row', { name: /^4 class There is no class B-99$/ }),
    ).toBeInTheDocument();

    await view.user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('cell', { name: 'Saad Qureshi' })).toBeInTheDocument();
  });

  it('shows why a whole file was refused, next to the file field', async () => {
    const api = loggedInAsAdmin();
    api.world.nextImport = new ApiError(
      400,
      'IMPORT_FILE_INVALID',
      'The file has no "class" column',
      {},
      {
        reason: 'missing_columns',
      },
    );
    const view = renderAdmin(api, '/students');
    const dialog = await openImport(view);

    await view.user.upload(within(dialog).getByLabelText('Excel or CSV file'), FILE);
    await view.user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText('The file has no "class" column')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Excel or CSV file')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('asks for a file before sending anything', async () => {
    const api = loggedInAsAdmin();
    const upload = vi.spyOn(api, 'importStudents');
    const view = renderAdmin(api, '/students');
    const dialog = await openImport(view);

    await view.user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(within(dialog).getByLabelText('Excel or CSV file')).toHaveAccessibleDescription(
      /Choose a file first/,
    );
    expect(upload).not.toHaveBeenCalled();
  });
});
