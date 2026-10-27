import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with server status ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.server).toBe('ok');
  });

  it('includes database status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.database).toBeDefined();
    expect(['ok', 'error']).toContain(res.body.database);
  });

  it('includes livekit status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.livekit).toBeDefined();
    expect(['ok', 'error']).toContain(res.body.livekit);
  });

  it('includes disk status with free and total', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.disk).toBeDefined();
    expect(typeof res.body.disk.free).toBe('number');
    expect(typeof res.body.disk.total).toBe('number');
    expect(res.body.disk.total).toBeGreaterThan(0);
  });
});
