import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { ClassesController } from './classes.controller.js';
import { ClassesService } from './classes.service.js';
import { GroupsService } from './groups.service.js';

/** Courses, batches, classes, enrolments and groups (ADM-03). */
@Module({
  imports: [AuthModule],
  controllers: [CoursesController, ClassesController],
  providers: [CoursesService, ClassesService, GroupsService],
})
export class OrganisationModule {}
