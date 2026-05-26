import {
  Body,
  Controller,
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

import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatGateway } from './chat.gateway';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('messages')
@Controller({ path: 'jobs/:jobId/messages', version: '1' })
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly chat: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les messages d\'un job' })
  list(
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.messages.list(jobId, user, {
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 50,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Envoyer un message texte' })
  async send(
    @Param('jobId') jobId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    const msg = await this.messages.send(jobId, dto, user);
    this.chat.broadcastToJob(jobId, 'message:new', msg);
    return msg;
  }

  @Post('image')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envoyer un message avec image' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async sendImage(
    @Param('jobId') jobId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(png|jpe?g|webp|gif)$/i })
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    const msg = await this.messages.send(jobId, dto, user, file);
    this.chat.broadcastToJob(jobId, 'message:new', msg);
    return msg;
  }

  @Put('read')
  @ApiOperation({ summary: 'Marquer tous les messages reçus comme lus' })
  markRead(@Param('jobId') jobId: string, @CurrentUser() user: JwtUser) {
    return this.messages.markRead(jobId, user);
  }
}
