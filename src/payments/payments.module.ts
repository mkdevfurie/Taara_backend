import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './providers/stripe.provider';
import { MobileMoneyProvider } from './providers/mobile-money.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeProvider, MobileMoneyProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
