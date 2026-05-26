import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiBearerAuth('jwt')
@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Utilisateur courant (avec fiche pro et wallet)' })
  me(@CurrentUser() user: JwtUser) {
    return this.users.findById(user.id);
  }

  @Post('upgrade-to-pro')
  @ApiOperation({ summary: 'Passer en mode PRO (crée la fiche Professional)' })
  upgrade(@CurrentUser() user: JwtUser) {
    return this.users.upgradeToPro(user);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'un utilisateur (admin ou soi-même)" })
  getById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    if (id !== user.id && user.userType !== 'ADMIN') {
      // On retourne une version publique allégée
      return this.users.findById(id).then((u: Record<string, unknown>) => {
        const publicKeys = ['id', 'firstName', 'lastName', 'profileImage', 'userType', 'professional'];
        return Object.fromEntries(Object.entries(u).filter(([k]) => publicKeys.includes(k)));
      });
    }
    return this.users.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: "Modifier son profil (ou n'importe quel profil en admin)" })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtUser) {
    return this.users.update(id, dto, user);
  }

  @Put(':id/password')
  @ApiOperation({ summary: 'Changer son mot de passe' })
  changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.users.changePassword(id, dto, user);
  }

  @Put(':id/avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Uploader l'avatar (multipart 'file', max 5 MB, image/*)" })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateAvatar(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(png|jpe?g|webp|gif)$/i })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.users.updateAvatar(id, file, user);
  }
}
