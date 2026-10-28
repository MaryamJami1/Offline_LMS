import { describe, it, expect } from 'vitest';
import { HealthService } from './health.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// A stand-in for Prisma, so the two branches of the database check can both be
// exercised without a database. The "ok" branch is proved against the real
// PostgreSQL in test/nfr-12.infra-stack.spec.ts.
function prismaThat(behaviour: 'answers' | 'refuses'): PrismaService {
  return {
    $queryRawUnsafe: () =>
      behaviour === 'answers'
        ? Promise.resolve([{ 1: 1 }])
        : Promise.reject(new Error('connection refused')),
  } as unknown as PrismaService;
}

describe('HealthService database check', () => {
  it('reports ok when the database answers', async () => {
    const result = await new HealthService(prismaThat('answers')).check();

    expect(result.database).toBe('ok');
  });

  it('reports error, and does not throw, when the database refuses', async () => {
    const result = await new HealthService(prismaThat('refuses')).check();

    expect(result.database).toBe('error');
    expect(result.server).toBe('ok');
  });
});

describe('HealthService LiveKit check', () => {
  it('reports error when nothing listens on the LiveKit port', async () => {
    const previous = process.env['LIVEKIT_URL'];
    // Port 1 is reserved and never served, so this cannot pass by accident.
    process.env['LIVEKIT_URL'] = 'http://127.0.0.1:1';
    try {
      const result = await new HealthService(prismaThat('answers')).check();

      expect(result.livekit).toBe('error');
    } finally {
      if (previous === undefined) delete process.env['LIVEKIT_URL'];
      else process.env['LIVEKIT_URL'] = previous;
    }
  });
});
