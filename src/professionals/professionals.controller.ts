import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobStatus, UserType } from '@prisma/client';

import { ProfessionalsService } from './professionals.service';
import { SearchProfessionalsDto } from './dto/search-professionals.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('professionals')
@Controller({ path: 'professionals', version: '1' })
export class ProfessionalsController {
  constructor(private readonly pros: ProfessionalsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lister les professionnels (avec filtres)' })
  list(@Query() q: SearchProfessionalsDto) {
    return this.pros.search(q);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Alias de GET / pour compatibilité' })
  search(@Query() q: SearchProfessionalsDto) {
    return this.pros.search(q);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: "Détail d'un professionnel (+ derniers ratings)" })
  getById(@Param('id') id: string) {
    return this.pros.getById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: "Mettre à jour sa fiche pro (ou n'importe laquelle en admin)" })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfessionalDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.pros.update(id, dto, user);
  }

  @Post(':id/certifications')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ajouter un document de certification (image ou PDF)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addCertification(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^(image\/(png|jpe?g|webp)|application\/pdf)$/i })
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.pros.addCertification(id, file, user);
  }

  @Delete(':id/certifications')
  @ApiOperation({ summary: 'Retirer un justificatif ({ url })' })
  removeCertification(
    @Param('id') id: string,
    @Body('url') url: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.pros.removeCertification(id, url, user);
  }

  @Post(':id/verify')
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Vérifier / dévérifier un pro' })
  verify(@Param('id') id: string, @Body('verified') verified = true) {
    return this.pros.verify(id, verified);
  }

  @Get(':id/jobs')
  @ApiOperation({ summary: "Lister les jobs d'un pro (lui-même ou admin)" })
  jobs(@Param('id') id: string, @CurrentUser() user: JwtUser, @Query('status') status?: JobStatus) {
    return this.pros.getMyJobs(id, user, status);
  }

  @Get(':id/earnings')
  @ApiOperation({ summary: "Synthèse des revenus d'un pro" })
  earnings(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.pros.getEarnings(id, user);
  }

  @Public()
  @Get(':id/ratings')
  @ApiOperation({ summary: "Lister les notes d'un pro" })
  ratings(@Param('id') id: string, @Query('page') page = 1, @Query('perPage') perPage = 20) {
    return this.pros.getRatings(id, Number(page), Number(perPage));
  }
}
