// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { createDeviceKeyStore, type Encryption, type KeyFile } from './device-key-store.js';
import { pcIdentity } from './pc-identity.js';

/**
 * ADM-04 (device trust): the PC tells the server its name and MAC address
 * when it registers, and keeps the device key it is given with Electron's
 * safeStorage, which on Windows is DPAPI: the key on disk can be read back
 * only by the same Windows account on the same PC.
 *
 * A disk image cloned from a PC that has already started carries that PC's
 * encrypted key, and DPAPI on a clone can read it. So the key is kept with the
 * MAC address it was issued for, and a PC that no longer has that network card
 * throws the key away and registers as the new PC it is.
 */

function nic(
  mac: string,
  internal = false,
  family: 'IPv4' | 'IPv6' = 'IPv4',
): NetworkInterfaceInfo {
  return {
    address: family === 'IPv4' ? '192.168.10.101' : 'fe80::1',
    netmask: '255.255.255.0',
    family,
    mac,
    internal,
    cidr: null,
    ...(family === 'IPv6' ? { scopeid: 0 } : {}),
  } as NetworkInterfaceInfo;
}

describe('ADM-04 what the PC says about itself', () => {
  it('gives its name, its network card, Windows and the app version', () => {
    const identity = pcIdentity({
      hostname: 'LAB1-A1',
      interfaces: {
        Ethernet: [nic('aa:bb:cc:00:11:22')],
        'Loopback Pseudo-Interface 1': [nic('00:00:00:00:00:00', true)],
      },
      osVersion: 'Windows 11 23H2',
      appVersion: '0.1.0',
    });

    expect(identity).toEqual({
      hostname: 'LAB1-A1',
      mac: 'aa:bb:cc:00:11:22',
      macs: ['aa:bb:cc:00:11:22'],
      osVersion: 'Windows 11 23H2',
      appVersion: '0.1.0',
    });
  });

  it('skips loopback and empty addresses, and picks the same card every time', () => {
    const interfaces = {
      'Wi-Fi': [nic('aa:bb:cc:00:00:02')],
      Ethernet: [nic('aa:bb:cc:00:00:01'), nic('aa:bb:cc:00:00:01', false, 'IPv6')],
      Bluetooth: [nic('00:00:00:00:00:00')],
    };
    const identity = pcIdentity({
      hostname: 'LAB1-A1',
      interfaces,
      osVersion: 'w',
      appVersion: 'v',
    });

    expect(identity.mac).toBe('aa:bb:cc:00:00:01');
    expect(identity.macs).toEqual(['aa:bb:cc:00:00:01', 'aa:bb:cc:00:00:02']);
  });

  it('skips virtual adapters, whose address can change after a restart', () => {
    // Hyper-V and WSL (00:15:5d), VMware (00:50:56), VirtualBox (08:00:27),
    // Docker (02:42…) and any locally administered address, such as a
    // random Wi-Fi address, are not the PC's own card.
    const identity = pcIdentity({
      hostname: 'TTVC-LAPTOP2',
      interfaces: {
        'vEthernet (WSL)': [nic('00:15:5d:15:20:03')],
        'VMware Network Adapter VMnet1': [nic('00:50:56:c0:00:01')],
        'VirtualBox Host-Only Network': [nic('0a:00:27:00:00:0c')],
        'vEthernet (docker)': [nic('02:42:ac:11:00:02')],
        'Wi-Fi': [nic('3c:a9:f4:12:34:56')],
      },
      osVersion: 'w',
      appVersion: 'v',
    });

    expect(identity.mac).toBe('3c:a9:f4:12:34:56');
    expect(identity.macs).toEqual(['3c:a9:f4:12:34:56']);
  });

  it('falls back to a virtual adapter when the PC has nothing else', () => {
    const identity = pcIdentity({
      hostname: 'LAB1-A1',
      interfaces: { 'vEthernet (Default Switch)': [nic('00:15:5d:01:02:03')] },
      osVersion: 'w',
      appVersion: 'v',
    });

    expect(identity.mac).toBe('00:15:5d:01:02:03');
  });

  it('makes a host name the server accepts out of any Windows name', () => {
    const identity = pcIdentity({
      hostname: 'lab pc_07.local',
      interfaces: { Ethernet: [nic('aa:bb:cc:00:00:01')] },
      osVersion: 'w',
      appVersion: 'v',
    });

    expect(identity.hostname).toBe('LAB-PC-07');
  });

  it('cannot register without a network card', () => {
    expect(() =>
      pcIdentity({ hostname: 'LAB1-A1', interfaces: {}, osVersion: 'w', appVersion: 'v' }),
    ).toThrow(/network card/);
  });
});

/** Reversible and visibly not the key, like DPAPI's output. */
const fakeEncryption = (available = true): Encryption => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from(`sealed:${text}`).reverse(),
  decryptString: (data) =>
    Buffer.from(data)
      .reverse()
      .toString()
      .replace(/^sealed:/, ''),
});

function memoryFile(): KeyFile & { contents: Buffer | null } {
  const file = {
    contents: null as Buffer | null,
    read: () => file.contents,
    write: (data: Buffer) => {
      file.contents = data;
    },
    remove: () => {
      file.contents = null;
    },
  };
  return file;
}

describe('ADM-04 the device key on the PC', () => {
  let file: ReturnType<typeof memoryFile>;

  beforeEach(() => {
    file = memoryFile();
  });

  it('is not there before the first start', () => {
    expect(createDeviceKeyStore(file, fakeEncryption()).load(['aa:bb:cc:00:00:01'])).toBeNull();
  });

  it('is kept encrypted and read back with the card it was issued for', () => {
    const store = createDeviceKeyStore(file, fakeEncryption());
    store.save({ key: 'the-device-key', mac: 'aa:bb:cc:00:00:01' });

    expect(file.contents?.toString()).not.toContain('the-device-key');
    expect(store.load(['aa:bb:cc:00:00:01', 'aa:bb:cc:00:00:02'])).toEqual({
      key: 'the-device-key',
      mac: 'aa:bb:cc:00:00:01',
    });
  });

  it('is thrown away on a PC without that network card, such as a cloned disk', () => {
    const store = createDeviceKeyStore(file, fakeEncryption());
    store.save({ key: 'the-device-key', mac: 'aa:bb:cc:00:00:01' });

    expect(store.load(['aa:bb:cc:00:00:99'])).toBeNull();
    expect(file.contents).toBeNull();
  });

  it('is thrown away when it cannot be read back', () => {
    file.contents = Buffer.from('not what was written');

    expect(createDeviceKeyStore(file, fakeEncryption()).load(['aa:bb:cc:00:00:01'])).toBeNull();
    expect(file.contents).toBeNull();
  });

  it('is never written in plain text when Windows cannot encrypt it', () => {
    const store = createDeviceKeyStore(file, fakeEncryption(false));

    expect(() => store.save({ key: 'the-device-key', mac: 'aa:bb:cc:00:00:01' })).toThrow(
      /encrypt/,
    );
    expect(file.contents).toBeNull();
  });

  it('can be cleared, for a PC the admin has reset', () => {
    const store = createDeviceKeyStore(file, fakeEncryption());
    store.save({ key: 'the-device-key', mac: 'aa:bb:cc:00:00:01' });
    store.clear();

    expect(store.load(['aa:bb:cc:00:00:01'])).toBeNull();
  });
});
