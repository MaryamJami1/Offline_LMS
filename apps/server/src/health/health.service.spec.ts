import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
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

describe('HealthService LiveKit check, when the server answers but is not healthy', () => {
  // A LiveKit that is listening but replying 503 is not a healthy LiveKit. If
  // the check only asked "did the socket open", a half-dead server would be
  // reported ok and the console would send tokens into a room nobody can join.
  it('reports error when LiveKit answers with a failure status', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503);
      res.end('unavailable');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');

    const previous = process.env['LIVEKIT_URL'];
    process.env['LIVEKIT_URL'] = `http://127.0.0.1:${address.port}`;
    try {
      const result = await new HealthService(prismaThat('answers')).check();

      expect(result.livekit).toBe('error');
    } finally {
      if (previous === undefined) delete process.env['LIVEKIT_URL'];
      else process.env['LIVEKIT_URL'] = previous;
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
