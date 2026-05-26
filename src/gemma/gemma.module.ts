import { Global, Module } from '@nestjs/common';
import { GemmaService } from './gemma.service';

@Global()
@Module({
  providers: [GemmaService],
  exports: [GemmaService],
})
export class GemmaModule {}
