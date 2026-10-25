import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserType } from '@prisma/client';

import { SubscriptionsService } from './subscriptions.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: "Prix de l'abonnement pro et numéros de paiement TAARA" })
  plans() {
    return this.subscriptions.getPlans();
  }

  @ApiBearerAuth('jwt')
  @Roles(UserType.PRO)
  @Get('me')
  @ApiOperation({ summary: 'Statut et historique de mon abonnement (pro)' })
  me(@CurrentUser() user: JwtUser) {
    return this.subscriptions.getMine(user.id);
  }
}
