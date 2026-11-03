import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  createClassRequestSchema,
  createGroupRequestSchema,
  setStudentsRequestSchema,
  setTeachersRequestSchema,
  updateClassRequestSchema,
} from '@lingualab/shared';
import type {
  ClassGroup,
  ClassStudent,
  ClassView,
  CreateClassRequest,
  CreateGroupRequest,
  Items,
  SetStudentsRequest,
  SetTeachersRequest,
  UpdateClassRequest,
} from '@lingualab/shared';
import type { User } from '../generated/prisma/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccessService } from '../auth/access.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { ClassesService } from './classes.service.js';
import { GroupsService } from './groups.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/**
 * Classes, enrolments and groups (docs/docs/04-api-and-events.md, Classes and
 * groups). Staff only. Creating and changing a class, and who teaches or is
 * enrolled in it, is the admin's; a teacher reads their own classes and makes
 * their groups, which AccessService checks class by class.
 */
@Controller('classes')
@Roles('admin', 'teacher')
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly groups: GroupsService,
    private readonly access: AccessService,
  ) {}

  /** Every class for the admin; a teacher's own for a teacher. */
  @Get()
  async list(@CurrentUser() user: User): Promise<Items<ClassView>> {
    return this.classes.list(this.access.classFilter(user));
  }

  @Post()
  @Roles('admin')
  async create(
    @Body(new ZodValidationPipe(createClassRequestSchema)) body: CreateClassRequest,
  ): Promise<ClassView> {
    return this.classes.create(body);
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id', idPipe) id: string): Promise<ClassView> {
    await this.access.assertOwnClass(user, id);
    return this.classes.get(id);
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateClassRequestSchema)) body: UpdateClassRequest,
  ): Promise<ClassView> {
    return this.classes.update(id, body);
  }

  @Get(':id/students')
  async students(
    @CurrentUser() user: User,
    @Param('id', idPipe) id: string,
  ): Promise<Items<ClassStudent>> {
    await this.access.assertOwnClass(user, id);
    return this.classes.students(id);
  }

  @Put(':id/teachers')
  @Roles('admin')
  async setTeachers(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(setTeachersRequestSchema)) body: SetTeachersRequest,
  ): Promise<ClassView> {
    return this.classes.setTeachers(id, body.teacherIds);
  }

  @Put(':id/students')
  @Roles('admin')
  async setStudents(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(setStudentsRequestSchema)) body: SetStudentsRequest,
  ): Promise<Items<ClassStudent>> {
    return this.classes.setStudents(id, body.studentIds);
  }

  @Get(':id/groups')
  async listGroups(
    @CurrentUser() user: User,
    @Param('id', idPipe) id: string,
  ): Promise<Items<ClassGroup>> {
    await this.access.assertOwnClass(user, id);
    return this.groups.list(id);
  }

  @Post(':id/groups')
  async createGroups(
    @CurrentUser() user: User,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(createGroupRequestSchema)) body: CreateGroupRequest,
  ): Promise<Items<ClassGroup>> {
    await this.access.assertOwnClass(user, id);
    return this.groups.create(id, body);
  }
}
