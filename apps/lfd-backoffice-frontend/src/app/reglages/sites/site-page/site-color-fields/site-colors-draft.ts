import type { SiteColorsPayload, SiteView } from '@lfd/contracts';

import { normalizeSiteColor, SITE_COLOR_MESSAGES, siteColorIssue } from '../../site-color';

export type ColorKey = keyof SiteColorsPayload;

/** Une couleur à l'écran : son champ et son libellé. */
export interface ColorSlot {
  readonly key: ColorKey;
  readonly label: string;
}

/** Sous « Retrait » : les couleurs du retrait. */
export const PICKUP_SLOTS: readonly ColorSlot[] = [
  { key: 'pickupColorB2b', label: 'Couleur retrait B2B' },
  { key: 'pickupColorB2c', label: 'Couleur retrait B2C' },
];

/** Sous « Livraison » : les couleurs de la livraison. */
export const DELIVERY_SLOTS: readonly ColorSlot[] = [
  { key: 'deliveryColorB2b', label: 'Couleur livraison B2B' },
  { key: 'deliveryColorB2c', label: 'Couleur livraison B2C' },
];

const ALL_KEYS: readonly ColorKey[] = [...PICKUP_SLOTS, ...DELIVERY_SLOTS].map((s) => s.key);

/** À quelles clientèles on livre — `null` tant que la lecture n'a pas répondu. */
export interface DeliveryOpen {
  readonly b2b: boolean;
  readonly b2c: boolean;
}

/**
 * Ce que l'écran dit d'une couleur de livraison quand sa clientèle n'est pas
 * livrée : le champ reste visible mais grisé. Le serveur l'enregistre quand
 * même — c'est une aide à l'écran, pas une règle (Hugo, 2026-10-13).
 */
const DELIVERY_CLOSED: Readonly<Record<'b2b' | 'b2c', string>> = {
  b2b: 'Livraison aux professionnels non activée — à activer dans Livraison › Zones de livraison.',
  b2c: 'Livraison aux particuliers non activée — à activer dans Livraison › Zones de livraison.',
};

/** Les champs grisés et leur raison. Rien tant que l'ouverture est inconnue. */
export function closedColors(open: DeliveryOpen | null): Partial<Record<ColorKey, string>> {
  if (open === null) {
    return {};
  }
  return {
    ...(open.b2b ? {} : { deliveryColorB2b: DELIVERY_CLOSED.b2b }),
    ...(open.b2c ? {} : { deliveryColorB2c: DELIVERY_CLOSED.b2c }),
  };
}

export function colorsOf(site: SiteView): SiteColorsPayload {
  return {
    pickupColorB2b: site.pickupColorB2b,
    pickupColorB2c: site.pickupColorB2c,
    deliveryColorB2b: site.deliveryColorB2b,
    deliveryColorB2c: site.deliveryColorB2c,
  };
}

function normalized(value: string | null): string | null {
  return value === null ? null : normalizeSiteColor(value);
}

/** La phrase de refus de chaque couleur saisie mal formée. */
export function colorIssues(draft: SiteColorsPayload): Partial<Record<ColorKey, string>> {
  const issues: Partial<Record<ColorKey, string>> = {};
  for (const key of ALL_KEYS) {
    const value = draft[key];
    const issue = value === null ? null : siteColorIssue(value);
    if (issue !== null) {
      issues[key] = SITE_COLOR_MESSAGES[issue];
    }
  }
  return issues;
}

export function colorsDirty(draft: SiteColorsPayload, stored: SiteColorsPayload): boolean {
  return ALL_KEYS.some((key) => normalized(draft[key]) !== normalized(stored[key]));
}

/** Les quatre couleurs EN BLOC, normalisées : la charge du `PUT …/couleurs`. */
export function colorsPayload(draft: SiteColorsPayload): SiteColorsPayload {
  return {
    pickupColorB2b: normalized(draft.pickupColorB2b),
    pickupColorB2c: normalized(draft.pickupColorB2c),
    deliveryColorB2b: normalized(draft.deliveryColorB2b),
    deliveryColorB2c: normalized(draft.deliveryColorB2c),
  };
}

/**
 * Une saisie de couleur ; un champ vidé, ou le geste « Aucune couleur »,
 * revient à `null` — on peut retirer une couleur (Hugo, 2026-10-13).
 */
export function withColor(
  draft: SiteColorsPayload,
  key: ColorKey,
  value: string | null,
): SiteColorsPayload {
  return { ...draft, [key]: value === null || value.trim() === '' ? null : value };
}
