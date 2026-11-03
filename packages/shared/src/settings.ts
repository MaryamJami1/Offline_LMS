import { z } from 'zod';
import { isHexColour } from './contrast.js';

/**
 * Institute settings live in the database, not in code: the software name, logo
 * and main colour can change without a new build (ADM-07). Every app reads these
 * keys, so they are named here once.
 */
export const SETTING_KEYS = {
  softwareName: 'branding.software_name',
  instituteName: 'branding.institute_name',
  logoPath: 'branding.logo_path',
  primaryColour: 'branding.primary_colour',
  gradingScale: 'grading.scale',
  quizPassMark: 'grading.quiz_pass_mark',
  backupTime: 'backup.time',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** What a fresh install starts with; the admin changes these in Settings. */
export const DEFAULT_SETTINGS: Record<SettingKey, unknown> = {
  [SETTING_KEYS.softwareName]: 'Lab',
  [SETTING_KEYS.instituteName]: '',
  [SETTING_KEYS.logoPath]: '',
  // packages/ui token `primary`, the one colour that rebranding may replace.
  [SETTING_KEYS.primaryColour]: '#1D4ED8',
  [SETTING_KEYS.gradingScale]: [
    { grade: 'A', from: 80 },
    { grade: 'B', from: 70 },
    { grade: 'C', from: 60 },
    { grade: 'D', from: 50 },
    { grade: 'F', from: 0 },
  ],
  [SETTING_KEYS.quizPassMark]: 50,
  [SETTING_KEYS.backupTime]: '23:00',
};

/**
 * `GET /settings/branding`: what every app shows, read at start-up and on the
 * login screens before anyone logs in, so it is public. `logoUrl` is null
 * until the admin uploads a logo (ADM-07).
 */
export const brandingSchema = z.object({
  softwareName: z.string().min(1).max(60),
  instituteName: z.string().max(120),
  logoUrl: z.string().min(1).nullable(),
  primaryColour: z.string().refine(isHexColour, 'Use a colour like #1D4ED8'),
});

export type Branding = z.infer<typeof brandingSchema>;

/** What an app shows before the server answers, or when it cannot be reached. */
export const DEFAULT_BRANDING: Branding = {
  softwareName: 'Lab',
  instituteName: '',
  logoUrl: null,
  primaryColour: '#1D4ED8',
};
