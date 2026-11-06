import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { createFakeBridge, renderStudent } from './test/fake-bridge.js';

/**
 * ADM-04 on the PC: before anyone can log in, the PC has to reach the server
 * and be approved by the admin. Each of those screens says what is happening
 * and what to do, in words a lab technician can act on (07).
 */

describe('ADM-04 joining the lab', () => {
  it('says it is starting', async () => {
    renderStudent(createFakeBridge({ screen: 'starting' }));

    expect(await screen.findByText('Starting…')).toBeInTheDocument();
  });

  it('waits for approval and names the PC the admin will see', async () => {
    renderStudent(createFakeBridge({ screen: 'waiting', hostname: 'LAB1-A1' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Waiting for approval' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This PC: LAB1-A1')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ask the admin to approve this PC in Lab and seats. This screen moves on by itself.',
      ),
    ).toBeInTheDocument();
  });

  it('says the server cannot be reached, and where it is looking', async () => {
    renderStudent(createFakeBridge({ screen: 'unreachable', serverUrl: 'https://192.168.10.2' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'The server cannot be reached' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Looking for https://192.168.10.2. Trying again every 30 seconds.'),
    ).toBeInTheDocument();
  });

  it('says what the admin has to put right', async () => {
    renderStudent(
      createFakeBridge({
        screen: 'refused',
        message: 'This PC has been retired. Ask the admin to press Reset for it in Lab and seats.',
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This PC cannot join the lab' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This PC has been retired. Ask the admin to press Reset for it in Lab and seats.',
      ),
    ).toBeInTheDocument();
  });
});
