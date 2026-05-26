import { Module } from '@nestjs/common';
import { SubcontractorsController } from './subcontractors.controller';
import { SubcontractorsService } from './subcontractors.service';

@Module({
  controllers: [SubcontractorsController],
  providers: [SubcontractorsService],
  exports: [SubcontractorsService],
})
export class SubcontractorsModule {}
