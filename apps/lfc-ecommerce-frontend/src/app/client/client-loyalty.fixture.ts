import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import type { MyLoyaltyView } from '@lfd/contracts';

import { ClientLoyalty } from './client-loyalty.service';

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

/** Ce que les suites du bon lisent de la fidélité : la vue, et la relecture. */
export interface LoyaltyDouble {
  readonly view: WritableSignal<MyLoyaltyView | null>;
  readonly isOpen: Signal<boolean>;
  /** Le nombre de relectures demandées — ce qu'un refus ou une passation déclenche. */
  readonly reads: { count: number };
  load(): Promise<void>;
}

/**
 * **Une fidélité doublée**, pour les suites dont le sujet est le choix du bon
 * au panier et à la passation — la lecture elle-même est éprouvée contre le
 * vrai service (`client-loyalty.service.spec.ts`).
 */
export function loyaltyDouble(view: MyLoyaltyView | null = OPEN_LOYALTY): LoyaltyDouble {
  const view$ = signal<MyLoyaltyView | null>(view);
  const reads = { count: 0 };
  return {
    view: view$,
    isOpen: computed(() => view$()?.open === true),
    reads,
    load: (): Promise<void> => {
      reads.count += 1;
      return Promise.resolve();
    },
  };
}

/** Le fournisseur à poser dans un `TestBed`. */
export const provideLoyalty = (double: LoyaltyDouble) => ({
  provide: ClientLoyalty,
  useValue: double,
});
