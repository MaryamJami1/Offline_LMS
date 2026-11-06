import { z } from 'zod';
import { exitPinSchema } from '@lingualab/shared';
import type { PrismaClient, Prisma } from '../generated/prisma/index.js';
import { hashPassword } from '../auth/password.js';

/**
 * The admin PIN that closes the student app (STU-06). It is kept as a setting
 * of its own, beside the institute's settings but never answered by any of
 * them: only its hash is stored, and only the server checks it.
 */
export const EXIT_PIN_KEY = 'lab.exit_pin';

/**
 * What is stored under EXIT_PIN_KEY. `changedAt` is null while the PIN is the
 * one the seed wrote, which the admin must change.
 */
const storedExitPinSchema = z.object({
  hash: z.string().min(1),
  changedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type StoredExitPin = z.infer<typeof storedExitPinSchema>;

/** A Prisma client or the transaction a change is being made in. */
type Writer = Pick<PrismaClient | Prisma.TransactionClient, 'setting'>;

/** The stored PIN, or null when there is none or it cannot be read. */
export async function readExitPin(reader: Writer): Promise<StoredExitPin | null> {
  const row = await reader.setting.findUnique({ where: { key: EXIT_PIN_KEY } });
  const parsed = storedExitPinSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

/** Hashed before any transaction opens, since hashing is deliberately slow. */
export async function exitPinValue(pin: string, changedAt: Date | null): Promise<StoredExitPin> {
  const checked = exitPinSchema.safeParse(pin);
  if (!checked.success) {
    throw new Error('The exit PIN must be six digits');
  }
  return { hash: await hashPassword(checked.data), changedAt: changedAt?.toISOString() ?? null };
}

/** Stores a PIN, replacing any there is. */
export async function storeExitPin(
  writer: Writer,
  options: { pin: string; updatedBy: string; changedAt: Date | null },
): Promise<StoredExitPin> {
  const value = await exitPinValue(options.pin, options.changedAt);
  await writeExitPin(writer, value, options.updatedBy);
  return value;
}

export async function writeExitPin(
  writer: Writer,
  value: StoredExitPin,
  updatedBy: string,
): Promise<void> {
  await writer.setting.upsert({
    where: { key: EXIT_PIN_KEY },
    create: { key: EXIT_PIN_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
}
