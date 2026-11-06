import type { Branding, LoginResponse, LogoutReason } from '@lingualab/shared';
import { ServerError, ServerUnreachable, type ServerApi, type Tokens } from '../server-api.js';
import type { PcIdentity } from '../pc-identity.js';
import type { DeviceKeyStore, StoredDeviceKey } from '../device-key-store.js';

/**
 * The lab server in memory, answering the way 04 says it does, so the shell
 * can be tested without a server. Tests set the scene through the fields and
 * read back what was asked of it.
 */

export const DEVICE_ID = '0195f3a0-0000-7000-8000-000000000001';
export const STUDENT_ID = '0195f3a0-0000-7000-8000-000000000002';

export const IDENTITY: PcIdentity = {
  hostname: 'LAB1-A1',
  mac: 'aa:bb:cc:00:11:22',
  macs: ['aa:bb:cc:00:11:22'],
  osVersion: 'Windows 11 23H2',
  appVersion: '0.1.0',
};

interface Account {
  username: string;
  password: string;
  fullName: string;
  role: 'student' | 'teacher' | 'admin';
  mustChangePassword: boolean;
}

export class FakeServer implements ServerApi {
  /** Off: every call fails as if the network were down. */
  reachable = true;
  /** The PC as the server knows it: null until it registers. */
  pc: {
    key: string;
    approved: boolean;
    seat: { seatCode: string; labRoomName: string } | null;
  } | null = null;
  /** What a register call answers instead of the usual, like DEVICE_ALREADY_REGISTERED. */
  registerRefusal: ServerError | null = null;
  exitPin = '204816';
  exitTriesLeft = 5;
  accounts: Account[] = [
    {
      username: 'S-1001',
      password: 'Lab-pass-2026',
      fullName: 'Ayesha Khan',
      role: 'student',
      mustChangePassword: false,
    },
  ];
  /** Refresh tokens still alive. */
  live = new Set<string>();
  logouts: { refreshToken: string; reason: LogoutReason }[] = [];
  exits = 0;
  calls: string[] = [];
  private issued = 0;

  constructor(private readonly currentKey: () => string | null) {}

  private enter(name: string): void {
    this.calls.push(name);
    if (!this.reachable) {
      throw new ServerUnreachable();
    }
  }

  private notApproved(): ServerError {
    return new ServerError(403, 'DEVICE_NOT_APPROVED', 'This PC is not an approved lab PC.');
  }

  private approvedPc() {
    const key = this.currentKey();
    if (this.pc === null || !this.pc.approved || key !== this.pc.key) {
      throw this.notApproved();
    }
    return this.pc;
  }

  private tokens(): Tokens {
    this.issued += 1;
    const refreshToken = `refresh-${this.issued}`;
    this.live.add(refreshToken);
    return { accessToken: `access-${this.issued}`, refreshToken };
  }

  async branding(): Promise<Branding> {
    this.enter('branding');
    return { softwareName: 'Lab', instituteName: '', logoUrl: null, primaryColour: '#1D4ED8' };
  }

  async logo(_path: string): Promise<string | null> {
    return null;
  }

  async register(_identity: PcIdentity) {
    this.enter('register');
    if (this.registerRefusal !== null) {
      throw this.registerRefusal;
    }
    const key = this.currentKey();
    if (this.pc !== null && key === this.pc.key) {
      return {
        created: false,
        answer: {
          deviceId: DEVICE_ID,
          status: this.pc.approved ? ('approved' as const) : ('waiting' as const),
          deviceKey: null,
        },
      };
    }
    if (this.pc?.approved === true) {
      throw new ServerError(409, 'DEVICE_ALREADY_REGISTERED', 'This PC is already approved');
    }
    const newKey = `key-${this.calls.length}`;
    this.pc = { key: newKey, approved: false, seat: null };
    return {
      created: true,
      answer: { deviceId: DEVICE_ID, status: 'waiting' as const, deviceKey: newKey },
    };
  }

  /** What the admin does in Lab and seats. */
  approve(
    seat: { seatCode: string; labRoomName: string } | null = {
      seatCode: 'A1',
      labRoomName: 'Lab 1',
    },
  ) {
    if (this.pc === null) {
      throw new Error('the PC has not registered');
    }
    this.pc.approved = true;
    this.pc.seat = seat;
  }

  /** The admin's Reset: back to waiting, with no key, and every login on it ended. */
  reset() {
    this.pc = null;
    this.live.clear();
  }

  async deviceMe() {
    this.enter('deviceMe');
    const pc = this.approvedPc();
    return { deviceId: DEVICE_ID, hostname: IDENTITY.hostname, seat: pc.seat };
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    this.enter('login');
    // Matched ignoring case, as the server does.
    const account = this.accounts.find(
      (candidate) => candidate.username.toLowerCase() === username.toLowerCase(),
    );
    if (account === undefined || account.password !== password) {
      throw new ServerError(401, 'INVALID_CREDENTIALS', 'The username or password is wrong');
    }
    let seat = null;
    if (account.role === 'student') {
      const pc = this.approvedPc();
      if (pc.seat === null) {
        throw new ServerError(403, 'DEVICE_NOT_SEATED', 'This PC is not on a seat');
      }
      seat = pc.seat;
    }
    return {
      ...this.tokens(),
      user: {
        id: STUDENT_ID,
        username: account.username,
        fullName: account.fullName,
        role: account.role,
        mustChangePassword: account.mustChangePassword,
      },
      seat,
    };
  }

  async refresh(refreshToken: string) {
    this.enter('refresh');
    if (!this.live.delete(refreshToken)) {
      throw new ServerError(401, 'INVALID_TOKEN', 'This login has ended. Please log in again.');
    }
    return this.tokens();
  }

  async changePassword(_accessToken: string, currentPassword: string, newPassword: string) {
    this.enter('changePassword');
    const account = this.accounts[0] as Account;
    if (account.password !== currentPassword) {
      throw new ServerError(401, 'INVALID_CREDENTIALS', 'The username or password is wrong');
    }
    account.password = newPassword;
    account.mustChangePassword = false;
    this.live.clear();
    return {
      ...this.tokens(),
      user: {
        id: STUDENT_ID,
        username: account.username,
        fullName: account.fullName,
        role: account.role,
        mustChangePassword: false,
      },
      seat: this.pc?.seat ?? null,
    };
  }

  async logout(tokens: Tokens, reason: LogoutReason) {
    this.enter('logout');
    this.live.delete(tokens.refreshToken);
    this.logouts.push({ refreshToken: tokens.refreshToken, reason });
  }

  async exit(pin: string) {
    this.enter('exit');
    this.approvedPc();
    if (pin !== this.exitPin) {
      this.exitTriesLeft -= 1;
      if (this.exitTriesLeft === 0) {
        throw new ServerError(403, 'EXIT_PIN_LOCKED', 'Too many wrong PINs.', {
          unlocksAt: '2026-11-06T04:15:00.000Z',
        });
      }
      throw new ServerError(403, 'EXIT_PIN_WRONG', 'That PIN is wrong', {
        triesLeft: this.exitTriesLeft,
      });
    }
    this.exits += 1;
  }
}

/** The key store, in memory. */
export function memoryKeyStore(initial: StoredDeviceKey | null = null): DeviceKeyStore & {
  stored: StoredDeviceKey | null;
} {
  const store = {
    stored: initial,
    load: (macs: readonly string[]) =>
      store.stored !== null && macs.includes(store.stored.mac) ? store.stored : null,
    save: (stored: StoredDeviceKey) => {
      store.stored = stored;
    },
    clear: () => {
      store.stored = null;
    },
  };
  return store;
}
