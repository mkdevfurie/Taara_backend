import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les notifications de l\'utilisateur courant' })
  list(
    @CurrentUser() user: JwtUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.notifications.list(user.id, {
      unreadOnly: unreadOnly === 'true',
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
    });
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  markRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.notifications.markRead(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une notification' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.notifications.remove(id, user.id);
  }
}
