import { Module } from '@nestjs/common';

import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [JobsController, MessagesController],
  providers: [JobsService, MessagesService, ChatGateway],
  exports: [JobsService, MessagesService],
})
export class JobsModule {}
