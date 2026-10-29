import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { readDiskSpace, systemRoot } from './disk.js';
import type { DiskSpace } from './disk.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const [database, livekit, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkLiveKit(),
      readDiskSpace(systemRoot()),
    ]);

    return { server: 'ok', database, livekit, disk };
  }

  private async checkDatabase(): Promise<string> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkLiveKit(): Promise<string> {
    const livekitHost = process.env['LIVEKIT_URL'] ?? 'http://localhost:7880';
    try {
      const res = await fetch(livekitHost, { signal: AbortSignal.timeout(2000) });
      return res.ok ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}

export type { DiskSpace };
