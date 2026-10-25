import 'reflect-metadata';
import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('accepte les variables optionnelles laissées vides (FOO=)', () => {
    const cfg = validateEnv({ ...base, GEMMA_API_URL: '', PORT: '', SENTRY_DSN: '' });
    expect(cfg.GEMMA_API_URL).toBeUndefined();
    expect(cfg.PORT).toBe(3000);
  });

  it('rejette une vraie valeur invalide', () => {
    expect(() => validateEnv({ ...base, GEMMA_API_URL: 'pas une url' })).toThrow(/GEMMA_API_URL/);
  });

  it('exige les secrets JWT', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
