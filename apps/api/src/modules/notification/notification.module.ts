import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthzModule } from '../../common/authz/authz.module.js';

@Module({
  imports: [PrismaModule, AuthzModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
