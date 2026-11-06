import type { NetworkInterfaceInfo } from 'node:os';

/** What a lab PC tells the server when it registers or checks in (ADM-04). */
export interface PcIdentity {
  /** A name the server accepts: letters, digits and dashes, like LAB1-A1. */
  hostname: string;
  /** The card the PC registers with: the first of `macs`. */
  mac: string;
  /** Every real network card, sorted, to tell whether a stored key belongs to this PC. */
  macs: string[];
  osVersion: string;
  appVersion: string;
}

const EMPTY_MAC = '00:00:00:00:00:00';

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
  const macs = [
    ...new Set(
      Object.values(options.interfaces)
        .flatMap((addresses) => addresses ?? [])
        .filter((address) => !address.internal && address.mac !== EMPTY_MAC)
        .map((address) => address.mac.toLowerCase()),
    ),
  ].sort();
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
