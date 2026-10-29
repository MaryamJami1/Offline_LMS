import path from 'node:path';
import { defineConfig } from 'prisma/config';

// The lab server passes DATABASE_URL; this default matches infra/docker-compose.yml
// so a developer laptop needs no extra setup.
const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: { url: DATABASE_URL },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
    seed: 'pnpm db:seed',
  },
});
