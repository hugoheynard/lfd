import type { MyLoyaltyView } from '@lfd/contracts';

/**
 * **Une fidélité ouverte**, pour les suites de la carte et du service : 2 350
 * points à 1 000 le palier de 5,00 € HT, donc deux paliers convertibles.
 */
export const OPEN_LOYALTY: MyLoyaltyView = {
  open: true,
  balancePoints: 2350,
  pointsPerStep: 1000,
  stepValueCents: 500,
  convertibleSteps: 2,
  vouchers: [
    {
      id: 'v_available',
      valueCents: 500,
      issuedAt: '2026-09-27T08:00:00.000Z',
      expiresAt: '2027-09-27T08:00:00.000Z',
      status: 'available',
      usedOn: null,
    },
    {
      id: 'v_reserved',
      valueCents: 1000,
      issuedAt: '2026-09-20T08:00:00.000Z',
      expiresAt: '2027-09-20T08:00:00.000Z',
      status: 'reserved',
      usedOn: { orderId: 'ord_1', orderNumber: 'CMD-00042' },
    },
  ],
  entries: [
    {
      id: 'e_earned',
      kind: 'earned',
      points: 350,
      occurredAt: '2026-09-26T10:00:00.000Z',
      orderNumber: 'CMD-00041',
    },
    {
      id: 'e_converted',
      kind: 'converted',
      points: -1000,
      occurredAt: '2026-09-20T08:00:00.000Z',
      orderNumber: null,
    },
  ],
};

/** Ouverte, mais rien encore : ni point, ni bon, ni ligne. */
export const EMPTY_LOYALTY: MyLoyaltyView = {
  open: true,
  balancePoints: 0,
  pointsPerStep: 1000,
  stepValueCents: 500,
  convertibleSteps: 0,
  vouchers: [],
  entries: [],
};

export const CLOSED_LOYALTY: MyLoyaltyView = { open: false };
