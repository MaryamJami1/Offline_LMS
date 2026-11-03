import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { DEFAULT_BRANDING, SETTING_KEYS, brandingSchema } from '@lingualab/shared';
import type { Branding } from '@lingualab/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Where an app fetches the logo from; the file itself is served with ADM-07's upload. */
export const LOGO_URL = '/api/settings/branding/logo';

const BRANDING_KEYS = [
  SETTING_KEYS.softwareName,
  SETTING_KEYS.instituteName,
  SETTING_KEYS.logoPath,
  SETTING_KEYS.primaryColour,
] as const;

/**
 * Institute settings (ADM-07; docs/docs/03-database.md, settings). Only the
 * branding is read here so far, for every app and every login screen.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The branding as stored, each value checked on its own: one that is
   * missing or unusable falls back to its default and leaves the rest alone.
   * A colour that is valid but hard to read is passed on; the apps refuse it.
   */
  async branding(): Promise<Branding> {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...BRANDING_KEYS] } } });
    const stored = new Map(rows.map((row) => [row.key, row.value as unknown]));
    const fields = brandingSchema.shape;

    const pick = <T>(key: string, schema: z.ZodType<T>, fallback: T): T => {
      const parsed = schema.safeParse(stored.get(key));
      return parsed.success ? parsed.data : fallback;
    };
    const logoPath = stored.get(SETTING_KEYS.logoPath);

    return {
      softwareName: pick(
        SETTING_KEYS.softwareName,
        fields.softwareName,
        DEFAULT_BRANDING.softwareName,
      ),
      instituteName: pick(
        SETTING_KEYS.instituteName,
        fields.instituteName,
        DEFAULT_BRANDING.instituteName,
      ),
      logoUrl: typeof logoPath === 'string' && logoPath.trim().length > 0 ? LOGO_URL : null,
      primaryColour: pick(
        SETTING_KEYS.primaryColour,
        fields.primaryColour,
        DEFAULT_BRANDING.primaryColour,
      ),
    };
  }
}
