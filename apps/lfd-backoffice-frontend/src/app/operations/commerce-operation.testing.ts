import type { CommerceOperationView } from '@lfd/contracts';

/**
 * Une opération du commerce pour les specs de l'écran — les dates n'y sont
 * comparées à aucune horloge : l'état vient du serveur, l'écran ne le recalcule pas.
 */
export function commerceOperation(
  patch: Partial<CommerceOperationView> = {},
): CommerceOperationView {
  return {
    key: 'noel-2026',
    name: { fr: 'Noël 2026' },
    lede: { fr: 'La bûche, le panettone et le stollen.' },
    image: { url: 'https://cdn.test/noel.jpg', alt: 'Une bûche', focal: null },
    announceFrom: '2026-11-15T09:00:00.000Z',
    orderFrom: null,
    orderUntil: '2026-12-21T11:00:00.000Z',
    pickupFrom: '2026-12-23',
    pickupUntil: '2026-12-24',
    showsOrderUntilTime: true,
    audience: 'both',
    skus: ['BUCHE-01'],
    sellingSkus: ['BUCHE-01'],
    withoutSellingArticle: false,
    hidden: false,
    archivedAt: null,
    state: 'announced',
    shopDisplay: 'announcement_and_products',
    awaitingProducts: false,
    heldAtCommerce: true,
    lastWrite: null,
    ...patch,
  };
}
