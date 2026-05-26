import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  token!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'koffi@taara.app' })
  @IsString()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}
