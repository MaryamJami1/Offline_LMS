import type { NetworkInterfaceInfo } from 'node:os';

/** What a lab PC tells the server when it registers or checks in (ADM-04). */
export interface PcIdentity {
  /** A name the server accepts: letters, digits and dashes, like LAB1-A1. */
  hostname: string;
  /** The card the PC registers with: the first of `macs`. */
  mac: string;
  /** Every physical network card, sorted (virtual ones only if there is nothing else), to tell whether a stored key belongs to this PC. */
  macs: string[];
  osVersion: string;
  appVersion: string;
}

const EMPTY_MAC = '00:00:00:00:00:00';

/** Makers' prefixes of virtual adapters: Hyper-V and WSL, VMware, VirtualBox, Parallels. */
const VIRTUAL_PREFIXES = [
  '00:15:5d',
  '00:50:56',
  '00:0c:29',
  '00:05:69',
  '00:1c:14',
  '08:00:27',
  '00:1c:42',
];

/**
 * A virtual adapter, or a locally administered address (Docker, random Wi-Fi
 * addresses): either can change after a restart, so it cannot name the PC.
 */
function isVirtual(mac: string): boolean {
  const locallyAdministered = (Number.parseInt(mac.slice(0, 2), 16) & 0x02) !== 0;
  return locallyAdministered || VIRTUAL_PREFIXES.some((prefix) => mac.startsWith(prefix));
}

/** Windows allows names the server's hostname rule does not: keep the first label, dashes for the rest. */
function serverHostname(name: string): string {
  const cleaned = (name.split('.')[0] ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return cleaned === '' ? 'LAB-PC' : cleaned;
}

export function pcIdentity(options: {
  hostname: string;
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>;
  osVersion: string;
  appVersion: string;
}): PcIdentity {
  const all = [
    ...new Set(
      Object.values(options.interfaces)
        .flatMap((addresses) => addresses ?? [])
        .filter((address) => !address.internal && address.mac !== EMPTY_MAC)
        .map((address) => address.mac.toLowerCase()),
    ),
  ].sort();
  const physical = all.filter((mac) => !isVirtual(mac));
  const macs = physical.length > 0 ? physical : all;
  const mac = macs[0];
  if (mac === undefined) {
    throw new Error('This PC has no network card, so it cannot join the lab.');
  }
  return {
    hostname: serverHostname(options.hostname),
    mac,
    macs,
    osVersion: options.osVersion,
    appVersion: options.appVersion,
  };
}
