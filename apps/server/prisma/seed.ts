import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';
import { seed } from '../src/seed/seed.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://lingualab:lingualab@localhost:5432/lingualab';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

try {
  const summary = await seed(prisma);
  process.stdout.write(
    `Seeded: ${summary.admins} admin, ${summary.teachers} teachers, ` +
      `${summary.students} students, ${summary.classes} classes, ` +
      `${summary.seats} seats, ${summary.settings} settings.\n`,
  );
} finally {
  await prisma.$disconnect();
}
