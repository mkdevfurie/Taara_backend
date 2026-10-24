import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envoi d'emails transactionnels.
 * MAIL_PROVIDER = console (dev, log uniquement) | resend | sendgrid.
 * Les appels passent par l'API HTTP des providers (pas de SDK supplémentaire).
 * Un échec d'envoi est loggé mais ne fait jamais échouer la requête appelante.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(msg: MailMessage): Promise<boolean> {
    const provider = this.config.get<string>('MAIL_PROVIDER') ?? 'console';
    const from = this.config.get<string>('MAIL_FROM') ?? 'TAARA <no-reply@taara.app>';

    try {
      switch (provider) {
        case 'resend':
          return await this.sendWithResend(from, msg);
        case 'sendgrid':
          return await this.sendWithSendgrid(from, msg);
        default:
          this.logger.warn(`[mail:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
          return true;
      }
    } catch (e) {
      this.logger.error(`Envoi email échoué (${provider}) : ${(e as Error).message}`);
      return false;
    }
  }

  private async sendWithResend(from: string, msg: MailMessage): Promise<boolean> {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return true;
  }

  private async sendWithSendgrid(from: string, msg: MailMessage): Promise<boolean> {
    const apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    const match = /^(.*)<(.+)>$/.exec(from.trim());
    const sender = match ? { name: match[1].trim(), email: match[2].trim() } : { email: from };
    const content = [{ type: 'text/plain', value: msg.text }];
    if (msg.html) content.push({ type: 'text/html', value: msg.html });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: sender,
        subject: msg.subject,
        content,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return true;
  }
}
