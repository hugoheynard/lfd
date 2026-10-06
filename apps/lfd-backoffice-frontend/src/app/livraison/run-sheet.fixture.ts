import type { DeliveryRunSheetStopView } from '@lfd/contracts';

/** Un arrêt de feuille de route pour les specs — livré le matin, sans rien d'autre. */
export function stopOf(
  overrides: Partial<DeliveryRunSheetStopView> = {},
): DeliveryRunSheetStopView {
  return {
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'SARL Le Comptoir',
    tradeName: null,
    clientele: null,
    address: {
      label: '',
      ligne1: '3 rue des Lilas',
      ligne2: '',
      codePostal: '75011',
      ville: 'Paris',
      pays: 'FR',
    },
    window: { start: '08:00', end: '10:00', source: 'override' },
    contact: null,
    signatureRequired: false,
    orderNote: '',
    addressBook: null,
    totalUnits: 4,
    state: 'expected',
    readyAt: null,
    withoutAtelierSheet: false,
    placedAt: '2026-09-28T10:00:00.000Z',
    round: null,
    ...overrides,
  };
}
