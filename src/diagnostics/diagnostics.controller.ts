import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DiagnosticsService } from './diagnostics.service';
import { CreateDiagnosticDto } from './dto/create-diagnostic.dto';
import { ListDiagnosticsDto } from './dto/list-diagnostics.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('diagnostics')
@Controller({ path: 'diagnostics', version: '1' })
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Post()
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({
    summary: 'Créer un diagnostic (avec photo optionnelle) — appelle Gemma',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  create(
    @Body() dto: CreateDiagnosticDto,
    @CurrentUser() user: JwtUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(png|jpe?g|webp|gif)$/i })
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: false,
        }),
    )
    file?: Express.Multer.File,
  ) {
    return this.diagnostics.create(dto, user, file);
  }

  @Get('my')
  @ApiOperation({ summary: "Historique des diagnostics de l'utilisateur courant" })
  my(@CurrentUser() user: JwtUser, @Query() q: ListDiagnosticsDto) {
    return this.diagnostics.listMine(user, q);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un diagnostic" })
  getById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.diagnostics.getById(id, user);
  }

  @Get(':id/ai-analysis')
  @ApiOperation({ summary: "Analyse IA détaillée d'un diagnostic" })
  aiAnalysis(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.diagnostics.getAiAnalysis(id, user);
  }
}
