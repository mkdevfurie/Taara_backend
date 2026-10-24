import { ConfigService } from '@nestjs/config';
import { GemmaService } from './gemma.service';

describe('GemmaService (mock sans GEMMA_API_URL)', () => {
  const svc = new GemmaService({ get: () => undefined } as unknown as ConfigService);

  it('classe un problème de moteur en Électrique', async () => {
    const r = await svc.diagnose({ description: 'Mon moteur chauffe et fait du bruit' });
    expect(r.problemType).toBe('Électrique');
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('classe un problème de pompe en Pompe', async () => {
    const r = await svc.diagnose({ description: 'La pompe à eau ne débite plus' });
    expect(r.problemType).toBe('Pompe');
  });
});
