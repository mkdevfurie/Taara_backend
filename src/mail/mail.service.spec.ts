import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const config = (values: Record<string, string>) =>
  ({
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      if (!(k in values)) throw new Error(`missing ${k}`);
      return values[k];
    },
  }) as unknown as ConfigService;

describe('MailService', () => {
  const msg = { to: 'koffi@taara.app', subject: 'Test', text: 'Bonjour' };
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('en mode console, ne fait aucun appel réseau', async () => {
    const svc = new MailService(config({ MAIL_PROVIDER: 'console' }));
    await expect(svc.send(msg)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envoie via Resend avec la clé API', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const svc = new MailService(config({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }));
    await expect(svc.send(msg)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body).to).toEqual(['koffi@taara.app']);
  });

  it('découpe "Nom <email>" pour SendGrid', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const svc = new MailService(
      config({
        MAIL_PROVIDER: 'sendgrid',
        SENDGRID_API_KEY: 'SG.x',
        MAIL_FROM: 'TAARA <no-reply@taara.app>',
      }),
    );
    await svc.send(msg);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toEqual({ name: 'TAARA', email: 'no-reply@taara.app' });
  });

  it("renvoie false sans lever d'exception si le provider échoue", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const svc = new MailService(config({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }));
    await expect(svc.send(msg)).resolves.toBe(false);
  });
});
