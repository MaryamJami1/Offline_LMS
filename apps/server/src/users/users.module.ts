import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { ImportService } from './import/import.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, ImportService],
})
export class UsersModule {}
