import type {
  PriceGridBasketPart,
  PriceGridExportPayload,
  PriceGridPromotionView,
  PriceGridQuestion,
} from '@lfd/contracts';

/**
 * **Ce que le panneau d'export tient en main** (`plan-export-grille-de-prix.md`,
 * § 2) — pur : le brouillon des choix, et ce qu'il devient sur le fil.
 */

export type PriceGridAudienceChoice = PriceGridQuestion['audience']['kind'];
export type PriceGridMethodChoice = PriceGridQuestion['fulfillment']['method'];

export interface PriceGridDraft {
  readonly audience: PriceGridAudienceChoice;
  readonly companyId: string | null;
  /** `AAAA-MM-JJ`, ou vide : aujourd'hui. */
  readonly day: string;
  readonly method: PriceGridMethodChoice;
  readonly pickupId: string | null;
  readonly zoneId: string | null;
}

export const EMPTY_DRAFT: PriceGridDraft = {
  audience: 'individuals_registered',
  companyId: null,
  day: '',
  method: 'pickup',
  pickupId: null,
  zoneId: null,
};

export const AUDIENCE_OPTIONS: readonly { value: PriceGridAudienceChoice; label: string }[] = [
  { value: 'individuals_registered', label: 'Particuliers inscrits' },
  { value: 'individuals_guest', label: 'Particuliers sans compte' },
  { value: 'company', label: 'Une société précise' },
];

export const METHOD_OPTIONS: readonly { value: PriceGridMethodChoice; label: string }[] = [
  { value: 'pickup', label: 'Retrait' },
  { value: 'delivery', label: 'Livraison' },
];

/** « Décochée » : la remise n'est pas retenue du tout. */
export type PriceGridPartChoice = PriceGridBasketPart | 'unchecked';

export const PART_OPTIONS: readonly { value: PriceGridBasketPart; label: string }[] = [
  { value: 'column', label: 'Colonne à part' },
  { value: 'net', label: 'Dans le prix net estimé' },
  { value: 'ignored', label: 'Ignorée (nommée en tête)' },
];

/** La part proposée d'office à une remise listée. */
export const DEFAULT_PART: PriceGridBasketPart = 'column';

/** La question sur le fil — ou `null` tant qu'un choix manque. */
export function questionOf(draft: PriceGridDraft): PriceGridQuestion | null {
  const audience = audienceOf(draft);
  const fulfillment = fulfillmentOf(draft);
  if (audience === null || fulfillment === null) {
    return null;
  }
  return { audience, day: draft.day === '' ? null : draft.day, fulfillment };
}

function audienceOf(draft: PriceGridDraft): PriceGridQuestion['audience'] | null {
  if (draft.audience !== 'company') {
    return { kind: draft.audience };
  }
  return draft.companyId === null ? null : { kind: 'company', companyId: draft.companyId };
}

function fulfillmentOf(draft: PriceGridDraft): PriceGridQuestion['fulfillment'] | null {
  if (draft.method === 'pickup') {
    return draft.pickupId === null ? null : { method: 'pickup', pickupId: draft.pickupId };
  }
  return draft.zoneId === null ? null : { method: 'delivery', zoneId: draft.zoneId };
}

/** La demande d'export : les remises cochées, dans l'ordre de la liste. */
export function payloadOf(
  question: PriceGridQuestion,
  basket: readonly PriceGridPromotionView[],
  parts: ReadonlyMap<string, PriceGridPartChoice>,
  pricePerKg: boolean,
): PriceGridExportPayload {
  return {
    ...question,
    basketPromotions: basket.flatMap((promotion) => {
      const part = parts.get(promotion.id) ?? DEFAULT_PART;
      return part === 'unchecked' ? [] : [{ promotionId: promotion.id, part }];
    }),
    pricePerKg,
  };
}
