import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard, AccountStatusGuard } from '../../common/authz/authz.guards.js';
import { NotificationService } from './notification.service.js';

@Controller('notifications')
@UseGuards(AuthGuard, AccountStatusGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  listNotifications(@Req() req: any) {
    return this.notificationService.listNotifications(req.user?.id);
  }

  @Post('read-all')
  markAllRead(@Req() req: any) {
    return this.notificationService.markAllRead(req.user?.id);
  }
}
