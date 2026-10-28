import { statfs } from 'node:fs/promises';
import { platform } from 'node:os';

export interface DiskSpace {
  free: number;
  total: number;
  status: 'ok' | 'error';
}

/** The volume the server is installed on. */
export function systemRoot(): string {
  return platform() === 'win32' ? 'C:\\' : '/';
}

/**
 * Free and total bytes on `root`.
 *
 * A failed reading carries status "error" rather than two zeros, so the caller
 * can tell "the disk could not be read" from "the disk is full" — the installer
 * is told to check that disk shows OK (07-installation.md).
 */
export async function readDiskSpace(root: string): Promise<DiskSpace> {
  try {
    const stats = await statfs(root);
    const blockSize = Number(stats.bsize);
    return {
      free: blockSize * Number(stats.bavail),
      total: blockSize * Number(stats.blocks),
      status: 'ok',
    };
  } catch {
    return { free: 0, total: 0, status: 'error' };
  }
}
