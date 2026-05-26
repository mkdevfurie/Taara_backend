import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

class EnvVars {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  DIRECT_URL?: string;

  @IsString()
  @MinLength(16, { message: 'JWT_ACCESS_SECRET doit faire au moins 16 caractères' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET doit faire au moins 16 caractères' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_FOLDER: string = 'taara';

  @IsString()
  @IsOptional()
  MAIL_FROM?: string;

  @IsString()
  @IsOptional()
  MAIL_PROVIDER: string = 'console';

  @IsString()
  @IsOptional()
  SENDGRID_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  GEMMA_API_URL?: string;

  @IsString()
  @IsOptional()
  GEMMA_API_KEY?: string;

  @IsInt()
  @IsOptional()
  THROTTLE_TTL: number = 60;

  @IsInt()
  @IsOptional()
  THROTTLE_LIMIT: number = 120;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }
  return validated;
}
