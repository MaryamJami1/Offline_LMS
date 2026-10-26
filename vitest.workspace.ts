import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/server',
  'apps/teacher',
  'apps/student',
  'apps/admin',
  'packages/shared',
  'packages/ui',
  'packages/test-utils',
]);
