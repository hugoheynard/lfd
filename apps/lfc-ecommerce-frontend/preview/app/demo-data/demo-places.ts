import type {
  DeliveryZoneView,
  FulfillmentDayView,
  PickupAddressView,
  PublicDeliveryAvailabilityView,
  PublicPickupSlot,
} from '@lfd/contracts';

import { demoDay, demoInstant } from './demo-days';

/**
 * **Les lieux et les heures de l'aperçu** — deux maisons fictives, une zone de
 * livraison, des créneaux le lendemain et le surlendemain. Tout est calculé à
 * partir d'aujourd'hui : l'aperçu propose toujours des heures à venir.
 */

const NO_DISCOUNT_AUDIENCE = { b2b: true, b2c: true } as const;

export const DEMO_LAB_ID = 'demo-pickup-lab';

export const DEMO_PICKUP_ADDRESSES: readonly PickupAddressView[] = [
  {
    id: DEMO_LAB_ID,
    label: 'Le Labo',
    ligne1: '1 rue de la Démonstration',
    ligne2: '',
    codePostal: '73000',
    ville: 'Chambéry',
    pays: 'France',
    isDefault: true,
    discount: { mode: 'percent', bp: 1000 },
    discountAudiences: NO_DISCOUNT_AUDIENCE,
    opening: {
      publicOpening: { start: '07:00', end: '13:00' },
      proPickup: { start: '05:30', end: '07:00' },
    },
    gps: null,
  },
  {
    id: 'demo-pickup-chalet',
    label: 'Le Chalet',
    ligne1: '2 place de l’Exemple',
    ligne2: '',
    codePostal: '73150',
    ville: 'Val-d’Isère',
    pays: 'France',
    isDefault: false,
    discount: null,
    discountAudiences: NO_DISCOUNT_AUDIENCE,
    opening: { publicOpening: { start: '08:00', end: '12:00' }, proPickup: null },
    gps: null,
  },
];

export const DEMO_DELIVERY_ZONES: readonly DeliveryZoneView[] = [
  {
    id: 'demo-zone-valley',
    postalPrefixes: ['730'],
    label: 'Chambéry et alentours',
    fee: { mode: 'amount', cents: 500 },
  },
];

export const DEMO_DELIVERY_AVAILABILITY: PublicDeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  windowMode: 'slot',
};

/** Le lendemain pour toutes les maisons, livraison comprise. */
export function demoFulfillmentDays(): readonly FulfillmentDayView[] {
  const tomorrow = demoDay(1);
  return [
    { pickupAddressId: null, date: tomorrow },
    ...DEMO_PICKUP_ADDRESSES.map((point) => ({ pickupAddressId: point.id, date: tomorrow })),
  ];
}

const SLOT_TIMES = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00'] as const;
const SLOT_MINUTES = 30;

/**
 * Les créneaux d'une journée : une demi-heure chacun, le premier COMPLET (pour
 * que le texte du créneau fermé ait de quoi s'afficher), un badge sur le
 * second.
 */
export function demoSlots(day: string): readonly PublicPickupSlot[] {
  return SLOT_TIMES.flatMap((time, index) => {
    const startAt = demoInstant(day, time);
    const start = startAt === null ? null : new Date(startAt);
    if (startAt === null || start === null) {
      return [];
    }
    const full = index === 0;
    return [
      {
        startAt,
        endAt: new Date(start.getTime() + SLOT_MINUTES * 60_000).toISOString(),
        day,
        time,
        badge: index === 1 ? 'Sortie du four' : null,
        serviceCapacity: 4,
        taken: full ? 4 : index,
        open: !full,
        nextOpenTime: full ? (SLOT_TIMES[1] ?? null) : null,
      },
    ];
  });
}
