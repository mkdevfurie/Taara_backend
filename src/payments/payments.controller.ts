import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth('jwt')
  @Post()
  @ApiOperation({ summary: 'Initier un paiement pour un job terminé' })
  initiate(@Body() dto: InitiatePaymentDto, @CurrentUser() user: JwtUser) {
    return this.payments.initiate(dto, user);
  }

  @ApiBearerAuth('jwt')
  @Get(':id/status')
  @ApiOperation({ summary: "Statut d'un paiement" })
  status(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.payments.getStatus(id, user);
  }

  @Public()
  @Post('webhook/stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Stripe (signature requise)' })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleStripeWebhook(raw, signature);
  }

  @Public()
  @Post('webhook/mobile-money')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Callback générique Mobile Money' })
  mobileMoneyWebhook(@Body() payload: unknown) {
    return this.payments.handleMobileMoneyCallback(payload);
  }
}
