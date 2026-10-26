import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { statfs } from 'node:fs/promises';
import { platform } from 'node:os';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const [database, livekit, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkLiveKit(),
      this.checkDisk(),
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

  private async checkDisk(): Promise<{ free: number; total: number }> {
    try {
      const root = platform() === 'win32' ? 'C:\\' : '/';
      const stats = await statfs(root);
      const blockSize = Number(stats.bsize);
      return {
        free: blockSize * Number(stats.bavail),
        total: blockSize * Number(stats.blocks),
      };
    } catch {
      return { free: 0, total: 0 };
    }
  }
}
