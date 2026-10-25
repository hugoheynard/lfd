import type { SiteColorsPayload, SiteView } from '@lfd/contracts';

import { normalizeSiteColor, SITE_COLOR_MESSAGES, siteColorIssue } from '../../site-color';

/**
 * Le brouillon des couleurs : chaque champ présent, `null` = aucune. Le
 * contrat laisse la teinte du réassort et la couleur du transfert facultatives (absente = inchangée) ;
 * l'écran, lui, l'envoie toujours.
 */
export type SiteColorsDraft = { readonly [K in keyof SiteColorsPayload]-?: string | null };

export type ColorKey = keyof SiteColorsDraft;

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

/**
 * Sous « Approvisionné » : la teinte des réassorts que le site reçoit —
 * leur part du camembert du compte à produire (Hugo, 2026-10-22).
 */
export const RESUPPLY_SLOTS: readonly ColorSlot[] = [
  { key: 'resupplyColor', label: 'Teinte du réassort' },
];

/**
 * Sous « Transfert » : la couleur de l'encadré qui regroupe les retraits de
 * ce site au colisage (Hugo, 2026-10-25). Vide : celle de la livraison.
 */
export const TRANSFER_SLOTS: readonly ColorSlot[] = [
  { key: 'transferColor', label: 'Couleur du transfert' },
];

const ALL_KEYS: readonly ColorKey[] = [
  ...PICKUP_SLOTS,
  ...DELIVERY_SLOTS,
  ...RESUPPLY_SLOTS,
  ...TRANSFER_SLOTS,
].map((s) => s.key);

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

export function colorsOf(site: SiteView): SiteColorsDraft {
  return {
    pickupColorB2b: site.pickupColorB2b,
    pickupColorB2c: site.pickupColorB2c,
    deliveryColorB2b: site.deliveryColorB2b,
    deliveryColorB2c: site.deliveryColorB2c,
    resupplyColor: site.resupplyColor,
    transferColor: site.transferColor,
  };
}

function normalized(value: string | null): string | null {
  return value === null ? null : normalizeSiteColor(value);
}

/** La phrase de refus de chaque couleur saisie mal formée. */
export function colorIssues(draft: SiteColorsDraft): Partial<Record<ColorKey, string>> {
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

export function colorsDirty(draft: SiteColorsDraft, stored: SiteColorsDraft): boolean {
  return ALL_KEYS.some((key) => normalized(draft[key]) !== normalized(stored[key]));
}

/** Les couleurs EN BLOC, normalisées : la charge du `PUT …/couleurs`. */
export function colorsPayload(draft: SiteColorsDraft): SiteColorsDraft {
  return {
    pickupColorB2b: normalized(draft.pickupColorB2b),
    pickupColorB2c: normalized(draft.pickupColorB2c),
    deliveryColorB2b: normalized(draft.deliveryColorB2b),
    deliveryColorB2c: normalized(draft.deliveryColorB2c),
    resupplyColor: normalized(draft.resupplyColor),
    transferColor: normalized(draft.transferColor),
  };
}

/**
 * Une saisie de couleur ; un champ vidé, ou le geste « Aucune couleur »,
 * revient à `null` — on peut retirer une couleur (Hugo, 2026-10-13).
 */
export function withColor(
  draft: SiteColorsDraft,
  key: ColorKey,
  value: string | null,
): SiteColorsDraft {
  return { ...draft, [key]: value === null || value.trim() === '' ? null : value };
}
