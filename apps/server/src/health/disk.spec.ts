import { describe, it, expect } from 'vitest';
import { readDiskSpace, systemRoot } from './disk.js';

// No such drive on Windows, and no such relative path on Linux, so statfs fails
// on both and the test says the same thing in CI as it does on the laptop.
const MISSING_VOLUME = 'Q:\\no-such-volume';

describe('readDiskSpace', () => {
  it('reports the real free and total space of a readable root', async () => {
    const disk = await readDiskSpace(systemRoot());

    expect(disk.status).toBe('ok');
    expect(disk.total).toBeGreaterThan(0);
    expect(disk.free).toBeGreaterThan(0);
  });

  // Without a status, a failed reading and a genuinely full disk are the same
  // two zeros, and 07-installation.md tells the installer to check that disk
  // "shows OK". The caller has to be able to tell them apart.
  it('reports error, not zero space, when the path cannot be read', async () => {
    const disk = await readDiskSpace(MISSING_VOLUME);

    expect(disk.status).toBe('error');
  });

  it('does not throw when the path cannot be read', async () => {
    await expect(readDiskSpace(MISSING_VOLUME)).resolves.toBeDefined();
  });
});
