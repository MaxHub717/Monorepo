import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminUserController } from './admin.controller.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [
      PrismaModule,
      AuthzModule,
  ],
  controllers: [
      UserController,
      AdminUserController,
  ],
  providers: [
      UserService,
  ],
})
export class UserModule {}