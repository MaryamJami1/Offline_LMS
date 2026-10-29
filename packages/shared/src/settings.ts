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
