import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser, RequireOwnership } from '../../common/authz/authz.decorators.js';
import { AuthGuard, AccountStatusGuard, OwnershipGuard } from '../../common/authz/authz.guards.js';
import { UserService } from './user.service.js';

@Controller('users')
@UseGuards(AuthGuard, AccountStatusGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.userService.getMe(userId);
  }

  @Get(':id')
  @UseGuards(OwnershipGuard)
  @RequireOwnership('id')
  getUser(@Param('id') id: string) {
    return this.userService.getUser(id);
  }
}
