import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

/**
 * Endpoints conformes au pattern Kubernetes / Cloud Run :
 *   - /health/live   : liveness  -> "le process tourne". Ne touche PAS la DB.
 *   - /health/ready  : readiness -> "le process peut servir des requêtes" (DB OK).
 *   - /health        : alias historique = readiness (compat).
 *
 * Cloud Run utilise les startup/liveness probes ; un /live qui ne dépend de
 * rien évite que la DB qui flanche tue tous les pods.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — le process est démarré' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      uptime: process.uptime(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — DB joignable' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', db: 'down' });
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      db: 'up',
    };
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check global (= readiness)' })
  check() {
    return this.ready();
  }
}
