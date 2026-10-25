import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobStatus, UserType } from '@prisma/client';

import { AdminService } from './admin.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import {
  SubscriptionsService,
  type SubscriptionStatus,
} from '../subscriptions/subscriptions.service';
import { ActivateSubscriptionDto } from '../subscriptions/dto/activate-subscription.dto';

@ApiBearerAuth('jwt')
@ApiTags('admin')
@Roles(UserType.ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly pros: ProfessionalsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // -------------------------------------------------------- USERS
  @Get('users')
  @ApiOperation({ summary: 'Lister tous les utilisateurs (filtrable)' })
  listUsers(
    @Query('q') q?: string,
    @Query('userType') userType?: UserType,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.admin.listUsers({
      q,
      userType,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
    });
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Bannir un utilisateur' })
  ban(@Param('id') id: string) {
    return this.admin.banUser(id, true);
  }

  @Put('users/:id/unban')
  @ApiOperation({ summary: 'Réactiver un utilisateur' })
  unban(@Param('id') id: string) {
    return this.admin.banUser(id, false);
  }

  // -------------------------------------------------------- PROFESSIONALS
  @Get('professionals')
  @ApiOperation({ summary: 'Lister tous les professionnels' })
  listPros(
    @Query('verifiedOnly') verifiedOnly?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.admin.listProfessionals({
      verifiedOnly: verifiedOnly === 'true' ? true : verifiedOnly === 'false' ? false : undefined,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
    });
  }

  @Put('professionals/:id/verify')
  @ApiOperation({ summary: 'Vérifier un pro' })
  verifyPro(@Param('id') id: string, @Body('verified') verified = true) {
    return this.pros.verify(id, verified);
  }

  // -------------------------------------------------------- SUBSCRIPTIONS
  @Get('subscriptions')
  @ApiOperation({ summary: 'Pros et statut de leur abonnement (trial | active | expired | none)' })
  listSubscriptions(
    @Query('status') status?: SubscriptionStatus,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.subscriptions.list({
      status:
        status && ['trial', 'active', 'expired', 'none'].includes(status) ? status : undefined,
      q,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
    });
  }

  @Post('professionals/:id/subscription')
  @ApiOperation({ summary: "Activer / prolonger l'abonnement d'un pro après paiement reçu" })
  activateSubscription(
    @Param('id') id: string,
    @Body() dto: ActivateSubscriptionDto,
    @CurrentUser() admin: JwtUser,
  ) {
    return this.subscriptions.activate(id, dto, admin.id);
  }

  // -------------------------------------------------------- JOBS
  @Get('jobs')
  @ApiOperation({ summary: 'Lister tous les jobs' })
  listJobs(
    @Query('status') status?: JobStatus,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.admin.listJobs({
      status,
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
    });
  }

  // -------------------------------------------------------- REPORTS
  @Get('reports')
  @ApiOperation({ summary: 'Synthèse analytique (dashboard)' })
  reports() {
    return this.admin.getReports();
  }

  // -------------------------------------------------------- WITHDRAWALS
  @Get('withdrawals/pending')
  @ApiOperation({ summary: 'Lister les retraits en attente' })
  pendingWithdrawals() {
    return this.admin.listPendingWithdrawals();
  }

  @Post('withdrawals/:id/approve')
  @ApiOperation({ summary: 'Valider un retrait (envoi mobile money / virement)' })
  approveWithdrawal(@Param('id') id: string) {
    return this.admin.approveWithdrawal(id);
  }

  @Post('withdrawals/:id/reject')
  @ApiOperation({ summary: 'Refuser un retrait (le montant est recrédité au pro)' })
  rejectWithdrawal(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.admin.rejectWithdrawal(id, reason);
  }
}
