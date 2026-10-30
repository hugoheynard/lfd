import type { PromotionView } from '@lfd/contracts';

/** Une promotion de ligne active, « −20 % · tout le monde · tous acheminements ». */
export function promotionView(over: Partial<PromotionView> = {}): PromotionView {
  return {
    id: 'promo_1',
    internalName: 'Croissants d’automne',
    label: { fr: '−20 % sur le croissant', en: null, it: null },
    reason: null,
    state: 'active',
    applicationPoint: 'line',
    effect: { kind: 'percent_off', value: 2000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    validFrom: '2026-11-01T00:00:00.000Z',
    validTo: null,
    audience: { kind: 'everyone', companyId: null },
    fulfillment: { kind: 'any', pickupId: null },
    scope: {
      mode: 'only',
      rules: [{ target: 'variant', targetId: 'VIE-001-1', eligible: true, name: 'Croissant' }],
    },
    conditions: [],
    summary: '−20 % · tout le monde · tous acheminements',
    paused: null,
    archived: null,
    legacySource: null,
    createdAt: '2026-10-30T10:00:00.000Z',
    ...over,
  };
}
