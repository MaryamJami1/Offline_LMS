import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { OrganisationModule } from './organisation/organisation.module.js';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    HealthModule,
    UsersModule,
    OrganisationModule,
  ],
})
export class AppModule {}
