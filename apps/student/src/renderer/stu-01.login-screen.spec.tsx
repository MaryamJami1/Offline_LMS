import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AYESHA, PLACE, createFakeBridge, renderStudent } from './test/fake-bridge.js';

/**
 * STU-01, the login screen S-01 (docs/prototype/screenshots/12): which PC and
 * seat this is, the student ID and password, and the reminder that any free
 * PC will do. The name comes from the branding (rule 8), "Lab" until the
 * server says otherwise. A first-login account changes its password first.
 */

const LOGIN = { screen: 'login', place: PLACE } as const;

describe('STU-01 the login screen (S-01)', () => {
  it('names the software and says which PC and seat this is', async () => {
    renderStudent(createFakeBridge(LOGIN));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Log in to Lab' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This PC: LAB1-D3 · Seat D3')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sit at any free PC. Your lessons, recordings and marks follow your account, not the computer.',
      ),
    ).toBeInTheDocument();
  });

  it('uses the name the institute has set', async () => {
    renderStudent(
      createFakeBridge(LOGIN, {
        softwareName: 'Speak Lab',
        instituteName: 'Al-Noor Institute',
        logoUrl: null,
        primaryColour: '#1D4ED8',
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Log in to Speak Lab' }),
    ).toBeInTheDocument();
  });

  it('shows the logo when there is one, and the headset mark when there is not', async () => {
    const withLogo = renderStudent(
      createFakeBridge(LOGIN, {
        softwareName: 'Lab',
        instituteName: '',
        logoUrl: 'data:image/png;base64,AQID',
        primaryColour: '#1D4ED8',
      }),
    );
    expect(await screen.findByRole('img', { name: 'Lab' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AQID',
    );
    withLogo.unmount();

    renderStudent(createFakeBridge(LOGIN));
    expect(await screen.findByTestId('headset-mark')).toBeInTheDocument();
  });

  it('says when the PC is not on a seat yet', async () => {
    renderStudent(
      createFakeBridge({
        screen: 'login',
        place: { hostname: 'LAB1-D3', seatCode: null, labRoomName: null },
      }),
    );

    expect(await screen.findByText('This PC: LAB1-D3 · No seat yet')).toBeInTheDocument();
  });

  it('sends the student ID and password', async () => {
    const fake = createFakeBridge(LOGIN);
    const view = renderStudent(fake);

    await view.user.type(await screen.findByLabelText('Student ID'), 'S-1001');
    await view.user.type(screen.getByLabelText('Password'), 'Lab-pass-2026');
    await view.user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(fake.bridge.login).toHaveBeenCalledWith('S-1001', 'Lab-pass-2026');
  });

  it('logs in with Enter from the password field', async () => {
    const fake = createFakeBridge(LOGIN);
    const view = renderStudent(fake);

    await view.user.type(await screen.findByLabelText('Student ID'), 'S-1001');
    await view.user.type(screen.getByLabelText('Password'), 'Lab-pass-2026{Enter}');

    expect(fake.bridge.login).toHaveBeenCalledOnce();
  });

  it('shows what went wrong next to the field, and keeps the student ID', async () => {
    const fake = createFakeBridge(LOGIN);
    fake.bridge.login.mockResolvedValueOnce({
      ok: false,
      problem: { field: 'password', message: 'Wrong student ID or password' },
    });
    const view = renderStudent(fake);

    await view.user.type(await screen.findByLabelText('Student ID'), 'S-1001');
    await view.user.type(screen.getByLabelText('Password'), 'nope');
    await view.user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Wrong student ID or password')).toBeInTheDocument();
    expect(screen.getByLabelText('Student ID')).toHaveValue('S-1001');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('shows a problem with no field above the form', async () => {
    const fake = createFakeBridge(LOGIN);
    fake.bridge.login.mockResolvedValueOnce({
      ok: false,
      problem: { message: 'This PC is not on a seat yet. Ask the admin.' },
    });
    const view = renderStudent(fake);

    await view.user.type(await screen.findByLabelText('Student ID'), 'S-1001');
    await view.user.type(screen.getByLabelText('Password'), 'Lab-pass-2026');
    await view.user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This PC is not on a seat yet. Ask the admin.',
    );
  });

  it('says why the student was logged out', async () => {
    renderStudent(
      createFakeBridge({
        ...LOGIN,
        notice: 'You were logged out after 30 minutes without use.',
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'You were logged out after 30 minutes without use.',
    );
  });
});

describe('STU-01 the first login', () => {
  const CHANGE = { screen: 'change-password', place: PLACE, student: AYESHA } as const;

  it('asks for a new password, typed twice', async () => {
    const fake = createFakeBridge(CHANGE);
    const view = renderStudent(fake);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a new password' }),
    ).toBeInTheDocument();
    await view.user.type(screen.getByLabelText('Current password'), 'Lab-pass-2026');
    await view.user.type(screen.getByLabelText('New password'), 'Karachi-2026');
    await view.user.type(screen.getByLabelText('New password again'), 'Karachi-2026');
    await view.user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(fake.bridge.changePassword).toHaveBeenCalledWith('Lab-pass-2026', 'Karachi-2026');
  });

  it('says when the two new passwords are not the same, before sending', async () => {
    const fake = createFakeBridge(CHANGE);
    const view = renderStudent(fake);

    await view.user.type(await screen.findByLabelText('Current password'), 'Lab-pass-2026');
    await view.user.type(screen.getByLabelText('New password'), 'Karachi-2026');
    await view.user.type(screen.getByLabelText('New password again'), 'Karachi-2027');
    await view.user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByText('The two passwords are not the same')).toBeInTheDocument();
    expect(fake.bridge.changePassword).not.toHaveBeenCalled();
  });
});

describe('STU-01 after logging in', () => {
  it('greets the student by name, at this PC and seat', async () => {
    renderStudent(createFakeBridge({ screen: 'home', place: PLACE, student: AYESHA }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Ayesha Khan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('S-1001 · LAB1-D3 · Seat D3')).toBeInTheDocument();
  });

  it('follows the main process from one screen to the next', async () => {
    const fake = createFakeBridge(LOGIN);
    renderStudent(fake);
    await screen.findByRole('heading', { name: 'Log in to Lab' });

    fake.show({ screen: 'home', place: PLACE, student: AYESHA });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Ayesha Khan' }),
    ).toBeInTheDocument();
  });
});
