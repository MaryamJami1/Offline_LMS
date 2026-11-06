-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "exit_pin_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exit_pin_locked_until" TIMESTAMPTZ(3);
