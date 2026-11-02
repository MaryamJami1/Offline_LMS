import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Global, because every module that changes something worth auditing needs it. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
