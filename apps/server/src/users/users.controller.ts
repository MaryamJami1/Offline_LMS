import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  IMPORT_MAX_BYTES,
  createUserRequestSchema,
  listUsersQuerySchema,
  updateUserRequestSchema,
} from '@lingualab/shared';
import type {
  AdminUser,
  CreateUserRequest,
  CreateUserResponse,
  ImportResponse,
  ListUsersQuery,
  ResetPasswordResponse,
  UpdateUserRequest,
  UserListResponse,
} from '@lingualab/shared';
import { AccessService } from '../auth/access.service.js';
import type { User } from '../generated/prisma/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClientIp } from '../common/client-ip.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { UsersService } from './users.service.js';
import { ImportService } from './import/import.service.js';
import type { ImportUpload } from './import/sheet.js';
import { UploadTooLargeInterceptor } from './import/upload-too-large.interceptor.js';

const idPipe = new ZodValidationPipe(z.uuid());

/**
 * Accounts (docs/docs/04-api-and-events.md, Auth and users). The admin's
 * alone, except a password reset: the role guard refuses everyone else before
 * any of this runs.
 */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly imports: ImportService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<UserListResponse> {
    return this.users.list(query);
  }

  @Post()
  async create(
    @CurrentUser() actor: User,
    @Body(new ZodValidationPipe(createUserRequestSchema)) body: CreateUserRequest,
    @ClientIp() ip: string,
  ): Promise<CreateUserResponse> {
    return this.users.create(actor, body, ip);
  }

  /** Multipart, with the file in the field `file`: .xlsx or .csv, at most 2 MB. */
  @Post('import')
  @HttpCode(200)
  @UseInterceptors(
    UploadTooLargeInterceptor,
    FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }),
  )
  async import(
    @CurrentUser() actor: User,
    @UploadedFile() file: ImportUpload | undefined,
    @ClientIp() ip: string,
  ): Promise<ImportResponse> {
    return this.imports.importStudents(actor, file, ip);
  }

  @Get(':id')
  async get(@Param('id', idPipe) id: string): Promise<AdminUser> {
    return this.users.get(id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: User,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateUserRequestSchema)) body: UpdateUserRequest,
    @ClientIp() ip: string,
  ): Promise<AdminUser> {
    return this.users.update(actor, id, body, ip);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  async unlock(
    @CurrentUser() actor: User,
    @Param('id', idPipe) id: string,
    @ClientIp() ip: string,
  ): Promise<AdminUser> {
    return this.users.unlock(actor, id, ip);
  }

  /**
   * ADM-11. Open to teachers as well, for the students of their own classes:
   * the role guard lets both in, and AccessService decides whose password
   * each may reset before anything changes.
   */
  @Post(':id/reset-password')
  @Roles('admin', 'teacher')
  @HttpCode(200)
  async resetPassword(
    @CurrentUser() actor: User,
    @Param('id', idPipe) id: string,
    @ClientIp() ip: string,
  ): Promise<ResetPasswordResponse> {
    await this.access.assertMayResetPassword(actor, id);
    return this.users.resetPassword(actor, id, ip);
  }
}
