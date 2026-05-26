/**
 * Sentry instrumentation.
 *
 * IMPORTANT : ce fichier DOIT être importé en tout premier dans main.ts
 * (avant tout autre import applicatif), sinon l'auto-instrumentation Node
 * ne pourra pas patcher http/express/socket.io.
 *
 * On garde Sentry totalement optionnel : si SENTRY_DSN n'est pas défini,
 * l'init est skip silencieusement.
 */
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
    integrations: [nodeProfilingIntegration()],
    // Tracing : 10% en prod, 100% en dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // PII : on n'envoie pas les emails / IPs par défaut
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
}
