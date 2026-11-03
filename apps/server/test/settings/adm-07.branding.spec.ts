import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DEFAULT_BRANDING, SETTING_KEYS, brandingSchema } from '@lingualab/shared';
import type { PrismaClient } from '../../src/generated/prisma/index.js';
import { resetDatabase } from '../db/database.js';
import { createAccount, createAuthTestApp, type AuthTestApp } from '../support/auth-app.js';

/**
 * ADM-07, the read side: every app asks `GET /settings/branding` for the
 * software name, logo and main colour when it starts, before anyone has logged
 * in (rule 8 in CLAUDE.md). Saving them is the rest of ADM-07.
 */

let context: AuthTestApp;
let app: INestApplication;
let prisma: PrismaClient;
let adminId: string;

function branding() {
  return request(app.getHttpServer()).get('/api/settings/branding');
}

async function store(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as never, updatedBy: adminId },
    update: { value: value as never },
  });
}

beforeAll(async () => {
  context = await createAuthTestApp();
  app = context.app;
  prisma = context.prisma;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  adminId = (await createAccount(prisma, { username: 'admin', role: 'admin' })).id;
});

afterAll(async () => {
  await app.close();
});

describe('ADM-07 GET /api/settings/branding', () => {
  it('answers without a login, since the login screens show it', async () => {
    const res = await branding();

    expect(res.status).toBe(200);
    expect(brandingSchema.parse(res.body)).toEqual(DEFAULT_BRANDING);
  });

  it('answers "Lab" in the default blue when nothing has been set', async () => {
    expect((await branding()).body).toEqual(DEFAULT_BRANDING);
  });

  it('answers what the institute has set', async () => {
    await store(SETTING_KEYS.softwareName, 'Speak Lab');
    await store(SETTING_KEYS.instituteName, 'Al-Noor Institute');
    await store(SETTING_KEYS.primaryColour, '#0F5132');

    expect((await branding()).body).toEqual({
      softwareName: 'Speak Lab',
      instituteName: 'Al-Noor Institute',
      logoUrl: null,
      primaryColour: '#0F5132',
    });
  });

  it('points at the logo once there is one', async () => {
    await store(SETTING_KEYS.logoPath, 'branding/logo.png');

    expect((await branding()).body.logoUrl).toBe('/api/settings/branding/logo');
  });

  it('falls back to the default for a value that is not usable, one setting at a time', async () => {
    await store(SETTING_KEYS.softwareName, '');
    await store(SETTING_KEYS.instituteName, 42);
    await store(SETTING_KEYS.primaryColour, 'blue');
    await store(SETTING_KEYS.logoPath, '   ');

    expect((await branding()).body).toEqual(DEFAULT_BRANDING);
  });

  it('keeps a colour the server holds even if it is hard to read, for the app to refuse', async () => {
    // Settings will refuse such a colour on save (ADM-07); until then the apps
    // check it themselves and keep the default, so the server passes it on.
    await store(SETTING_KEYS.primaryColour, '#FACC15');

    expect((await branding()).body.primaryColour).toBe('#FACC15');
  });

  it('says nothing else about the settings', async () => {
    const res = await branding();

    expect(Object.keys(res.body as object).sort()).toEqual([
      'instituteName',
      'logoUrl',
      'primaryColour',
      'softwareName',
    ]);
  });
});
