import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { WalletService } from './wallet.service';
import { WithdrawDto } from './dto/withdraw.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('wallet')
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: "Solde du wallet de l'utilisateur courant" })
  getMine(@CurrentUser() user: JwtUser) {
    return this.wallet.getMine(user);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Historique des transactions' })
  listTransactions(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('type') type?: string,
  ) {
    return this.wallet.listTransactions(user, {
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 30,
      type,
    });
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Demander un retrait (Mobile Money / banque)' })
  withdraw(@Body() dto: WithdrawDto, @CurrentUser() user: JwtUser) {
    return this.wallet.requestWithdraw(dto, user);
  }
}
