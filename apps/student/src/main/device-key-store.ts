import { z } from 'zod';

/** Electron's safeStorage, which on Windows is DPAPI, or a fake of it in tests. */
export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

/** The one file the key is kept in, in the student's app data folder. */
export interface KeyFile {
  read(): Buffer | null;
  write(data: Buffer): void;
  remove(): void;
}

/** The key the server issued, and the network card it was issued for. */
export interface StoredDeviceKey {
  key: string;
  mac: string;
}

const storedSchema = z.object({ key: z.string().min(1), mac: z.string().min(1) });

export interface DeviceKeyStore {
  /** The key, if there is one for a card this PC has; anything else is thrown away. */
  load(macs: readonly string[]): StoredDeviceKey | null;
  save(stored: StoredDeviceKey): void;
  clear(): void;
}

/**
 * The PC's device key (ADM-04; docs/docs/06-security-and-data.md, Device
 * trust), encrypted with DPAPI so that only this Windows account on this PC
 * can read it, and never written in plain text.
 */
export function createDeviceKeyStore(file: KeyFile, encryption: Encryption): DeviceKeyStore {
  return {
    load(macs) {
      const data = file.read();
      if (data === null) {
        return null;
      }
      let stored: StoredDeviceKey | null = null;
      try {
        const parsed = storedSchema.safeParse(JSON.parse(encryption.decryptString(data)));
        stored = parsed.success ? parsed.data : null;
      } catch {
        stored = null;
      }
      // Unreadable, or issued to a network card this PC does not have, as on a
      // disk cloned from another PC: the PC registers again as itself.
      if (stored === null || !macs.includes(stored.mac)) {
        file.remove();
        return null;
      }
      return stored;
    },
    save(stored) {
      if (!encryption.isEncryptionAvailable()) {
        throw new Error('Windows cannot encrypt the device key, so it is not saved.');
      }
      file.write(encryption.encryptString(JSON.stringify(stored)));
    },
    clear() {
      file.remove();
    },
  };
}
