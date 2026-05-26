import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { CurrentUser, type JwtUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('jwt')
@ApiTags('ratings')
@Controller({ path: 'ratings', version: '1' })
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Noter un job terminé (client)' })
  create(@Body() dto: CreateRatingDto, @CurrentUser() user: JwtUser) {
    return this.ratings.create(dto, user);
  }
}
