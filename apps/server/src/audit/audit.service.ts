import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/index.js';

/** One entry: who did what to which record, from which address. */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Context for the reader. Never a password, a token or a hash. */
  details?: Prisma.InputJsonObject;
  ip: string;
}

/** A Prisma client or the transaction a change is being made in. */
type Writer = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * The only way the app writes to audit_logs, and it only adds: there is no
 * update and no delete here (docs/docs/06-security-and-data.md). Pass the
 * transaction the change is made in, so a change cannot be saved without its
 * entry, nor an entry without its change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entries: AuditEntry | AuditEntry[], writer: Writer = this.prisma): Promise<void> {
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0) {
      return;
    }
    await writer.auditLog.createMany({
      data: list.map((entry) => ({
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        details: entry.details ?? {},
        ip: entry.ip,
      })),
    });
  }
}
