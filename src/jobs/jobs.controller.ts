import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';

import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { AcceptJobDto, CompleteJobDto, DeclineJobDto } from './dto/quote-job.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une demande de job (client)' })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: JwtUser) {
    return this.jobs.create(dto, user);
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Mes demandes (client)' })
  myRequests(@CurrentUser() user: JwtUser, @Query('status') status?: JobStatus) {
    return this.jobs.myRequests(user, status);
  }

  @Get('my-assigned')
  @ApiOperation({ summary: 'Mes jobs assignés (pro)' })
  myAssigned(@CurrentUser() user: JwtUser, @Query('status') status?: JobStatus) {
    return this.jobs.myAssigned(user, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un job' })
  getById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.jobs.getById(id, user);
  }

  @Put(':id/accept')
  @ApiOperation({ summary: 'Le pro accepte le job avec un prix proposé' })
  accept(@Param('id') id: string, @Body() dto: AcceptJobDto, @CurrentUser() user: JwtUser) {
    return this.jobs.accept(id, dto, user);
  }

  @Put(':id/decline')
  @ApiOperation({ summary: 'Le pro refuse le job' })
  decline(@Param('id') id: string, @Body() dto: DeclineJobDto, @CurrentUser() user: JwtUser) {
    return this.jobs.decline(id, dto, user);
  }

  @Put(':id/start')
  @ApiOperation({ summary: 'Le pro démarre l\'intervention' })
  start(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.jobs.start(id, user);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: 'Le pro clôture le job (prix final + preuve)' })
  complete(@Param('id') id: string, @Body() dto: CompleteJobDto, @CurrentUser() user: JwtUser) {
    return this.jobs.complete(id, dto, user);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Annuler le job (client ou admin uniquement)' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.jobs.cancel(id, user);
  }
}
