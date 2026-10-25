import { ConfigService } from '@nestjs/config';
import { SubscriptionChannel } from '@prisma/client';

import { SubscriptionsService, addMonths } from './subscriptions.service';

describe('addMonths', () => {
  it('ajoute des mois en restant sur le dernier jour du mois', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonths(new Date(2026, 9, 15), 3)).toEqual(new Date(2027, 0, 15));
  });
});

describe('SubscriptionsService', () => {
  const env: Record<string, string> = { SUBSCRIPTION_MONTHLY_PRICE: '5000', PRO_TRIAL_MONTHS: '3' };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const prisma = {
    professional: { findUnique: jest.fn(), update: jest.fn((a) => a) },
    subscription: { create: jest.fn((a) => ({ id: 's1', ...a.data })) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const notifications = { create: jest.fn() };
  const svc = new SubscriptionsService(prisma as never, config, notifications as never);

  beforeEach(() => jest.clearAllMocks());

  it("offre l'essai configuré à la création d'un pro", () => {
    const now = new Date(2026, 9, 24);
    const data = svc.trialCreateData(now) as { subscriptionEndsAt: Date };
    expect(data.subscriptionEndsAt).toEqual(new Date(2027, 0, 24));
    env.PRO_TRIAL_MONTHS = '0';
    expect(svc.trialCreateData(now)).toEqual({});
    env.PRO_TRIAL_MONTHS = '3';
  });

  it("prolonge à partir de la fin de l'abonnement en cours", async () => {
    const future = addMonths(new Date(), 2);
    prisma.professional.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      subscriptionEndsAt: future,
    });
    const r = await svc.activate(
      'p1',
      { months: 1, channel: SubscriptionChannel.T_MONEY },
      'admin',
    );
    expect(r.subscriptionEndsAt).toEqual(addMonths(future, 1));
    expect(r.amount).toBe(5000);
    expect(notifications.create).toHaveBeenCalled();
  });

  it("repart d'aujourd'hui si l'abonnement est expiré", async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      subscriptionEndsAt: new Date(2020, 0, 1),
    });
    const before = Date.now();
    const r = await svc.activate(
      'p1',
      { months: 3, channel: SubscriptionChannel.FLOOZ, amount: 12000 },
      'admin',
    );
    expect(r.startsAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(r.amount).toBe(12000);
  });
});
