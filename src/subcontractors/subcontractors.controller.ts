import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SubcontractorsService } from './subcontractors.service';
import { AddSubcontractorDto, PaySubcontractorDto } from './dto/add-subcontractor.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('subcontractors')
@Controller({ version: '1' })
export class SubcontractorsController {
  constructor(private readonly subs: SubcontractorsService) {}

  @Post('jobs/:jobId/add-subcontractor')
  @ApiOperation({ summary: 'Ajouter un sous-traitant à un job' })
  add(
    @Param('jobId') jobId: string,
    @Body() dto: AddSubcontractorDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.subs.add(jobId, dto, user);
  }

  @Get('jobs/:jobId/subcontractors')
  @ApiOperation({ summary: "Lister les sous-traitants d'un job" })
  list(@Param('jobId') jobId: string, @CurrentUser() user: JwtUser) {
    return this.subs.list(jobId, user);
  }

  @Put('subcontractors/:id/accept')
  @ApiOperation({ summary: 'Le sous-traitant accepte sa mission' })
  accept(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.subs.accept(id, user);
  }

  @Put('subcontractors/:id/payment')
  @ApiOperation({ summary: 'Le pro principal paie le sous-traitant' })
  pay(@Param('id') id: string, @Body() dto: PaySubcontractorDto, @CurrentUser() user: JwtUser) {
    return this.subs.pay(id, dto, user);
  }
}
