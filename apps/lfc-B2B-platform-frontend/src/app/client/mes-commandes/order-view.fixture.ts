import type { OrderView } from '@lfd/contracts';

/**
 * **Une commande telle que NOTRE base la rend** — pas telle que le navigateur
 * l'avait gardée.
 *
 * 🔴 Les suites de l'accueil et du menu posaient une commande dans le
 * `localStorage`, parce que c'est là que ces deux écrans la lisaient. Ils lisent
 * désormais le serveur, comme « Mes commandes » l'a toujours fait : il fallait
 * donc une commande de cette forme-là, partagée, plutôt qu'une par suite.
 *
 * Écrite **en entier** plutôt que castée depuis un objet partiel : un champ
 * ajouté demain à `OrderView` doit faire rougir cette ligne, pas passer sous un
 * `as`. C'est le seul intérêt d'un fixture typé.
 */
export const LIVE_PICKUP: OrderView = {
  id: 'ord_9',
  orderNumber: 'CMD-0009',
  status: 'placed',
  paymentStatus: 'paid',
  requestedDeliveryDate: '2026-09-08',
  fulfillmentMethod: 'pickup',
  deliveryAddressId: null,
  deliveryAddress: null,
  pickupAddress: {
    label: 'Le Labo',
    ligne1: 'Route de la Balme',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
  fulfillment: {
    window: { value: { start: '7:00', end: '8:00' }, source: 'override' },
    contact: { value: null, source: 'default' },
    signatureRequired: { value: false, source: 'default' },
  },
  note: '',
  subtotalCents: 1_137,
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  lateFeeAdjustment: null,
  vatCents: 63,
  // La ventilation figée par la commande. Écrite ici plutôt que `null` pour
  // que les écrans soient éprouvés sur le cas COURANT — une commande d'après
  // le 2026-09-07 la porte ; `null` est le cas des anciennes.
  vatShares: [{ rate: 5.5, amountCents: 63 }],
  totalCents: 1_200,
  currency: 'EUR',
  customerLabel: 'Hôtel des Trois Ponts',
  companyId: 'cmp_1',
  fromSubscriptionId: null,
  origin: 'self_service',
  placedByStaffId: null,
  recurringDeltas: null,
  placedAt: '2026-09-07T06:00:00.000Z',
  lines: [
    {
      sku: 'VIE-001',
      productName: 'Croissant',
      unitPriceMillicents: 56_850,
      vatRate: 5.5,
      quantity: 2,
      lineTotalCents: 1_137,
      pricing: null,
      allergens: null,
    },
  ],
  handoverToken: 'tok_secret_26',
  handedOverAt: null,
};
