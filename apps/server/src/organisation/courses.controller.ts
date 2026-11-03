import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createBatchRequestSchema,
  createCourseRequestSchema,
  listBatchesQuerySchema,
  updateBatchRequestSchema,
  updateCourseRequestSchema,
} from '@lingualab/shared';
import type {
  Batch,
  Course,
  CreateBatchRequest,
  CreateCourseRequest,
  Items,
  ListBatchesQuery,
  UpdateBatchRequest,
  UpdateCourseRequest,
} from '@lingualab/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Roles } from '../auth/roles.decorator.js';
import { CoursesService } from './courses.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/**
 * Courses and batches (docs/docs/04-api-and-events.md, Classes and groups).
 * The admin's alone: the role guard refuses everyone else.
 */
@Controller()
@Roles('admin')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get('courses')
  async listCourses(): Promise<Items<Course>> {
    return this.courses.listCourses();
  }

  @Post('courses')
  async createCourse(
    @Body(new ZodValidationPipe(createCourseRequestSchema)) body: CreateCourseRequest,
  ): Promise<Course> {
    return this.courses.createCourse(body);
  }

  @Patch('courses/:id')
  async updateCourse(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateCourseRequestSchema)) body: UpdateCourseRequest,
  ): Promise<Course> {
    return this.courses.updateCourse(id, body);
  }

  @Get('batches')
  async listBatches(
    @Query(new ZodValidationPipe(listBatchesQuerySchema)) query: ListBatchesQuery,
  ): Promise<Items<Batch>> {
    return this.courses.listBatches(query);
  }

  @Post('batches')
  async createBatch(
    @Body(new ZodValidationPipe(createBatchRequestSchema)) body: CreateBatchRequest,
  ): Promise<Batch> {
    return this.courses.createBatch(body);
  }

  @Patch('batches/:id')
  async updateBatch(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateBatchRequestSchema)) body: UpdateBatchRequest,
  ): Promise<Batch> {
    return this.courses.updateBatch(id, body);
  }
}
