import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminUserController } from './admin.controller.js';
import { PermissionsGuard } from '../../common/authz/authz.guards.js';

@Module({
  controllers: [UserController, AdminUserController],
  providers: [UserService, PrismaService, PermissionsGuard],
})
export class UserModule {}
