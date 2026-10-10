import { Body, Controller, Get, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard, AccountStatusGuard } from '../../common/authz/authz.guards.js';
import { NotificationService } from './notification.service.js';
import { UpdateNotificationPreferencesDto } from './notification.dto.js';

@Controller('notifications')
@UseGuards(AuthGuard, AccountStatusGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  listNotifications(@Req() req: any) {
    return this.notificationService.listNotifications(req.user?.id);
  }

  @Get('preferences')
  getPreferences(@Req() req: any) {
    return this.notificationService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  updatePreferences(@Req() req: any, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationService.updatePreferences(req.user.id, dto.competitionEnabled);
  }

  @Post('read-all')
  markAllRead(@Req() req: any) {
    return this.notificationService.markAllRead(req.user?.id);
  }
}
