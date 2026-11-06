import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AYESHA, PLACE, createFakeBridge, renderStudent } from './test/fake-bridge.js';

/**
 * STU-07, logging out by hand: the button is always there once a student is
 * logged in, and the main process ends the login and shows S-01 again.
 */

describe('STU-07 the Log out button', () => {
  it('logs the student out', async () => {
    const fake = createFakeBridge({ screen: 'home', place: PLACE, student: AYESHA });
    const view = renderStudent(fake);

    await view.user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(fake.bridge.logout).toHaveBeenCalledOnce();
  });

  it('is there on the first-login password screen too', async () => {
    const fake = createFakeBridge({ screen: 'change-password', place: PLACE, student: AYESHA });
    const view = renderStudent(fake);

    await view.user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(fake.bridge.logout).toHaveBeenCalledOnce();
  });
});
