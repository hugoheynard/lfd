import { cartAdjustmentCents, discountCentsOf } from "@lfd/contracts";

import {
  ensureDeliveryFeeMatches,
  ensureDiscountMatches,
  ensureLateFeeMatches,
} from "../../../orders/domain/entities/order-amount-guards.js";
import type { FrozenOrderAdjustments } from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { computeOrderTotals } from "../../../orders/domain/services/vat.js";
import { InvalidDeliveryNoteTermsError } from "../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "./delivery-note-line.js";

/**
 * Une valeur JSON figée, recopiée sans être lue — `vat_shares` et
 * `late_fee_adjustment` passent de la commande au BL TELS QUELS (plan E4a,
 * § 4) : le BL ne les interprète pas, il les garde.
 */
export type FrozenJson =
  | string
  | number
  | boolean
  | null
  | readonly FrozenJson[]
  | { readonly [key: string]: FrozenJson | undefined };

/**
 * **L'en-tête d'un bon de livraison** — les totaux de sa commande, recopiés
 * (plan E4a (`documentation/commandes/bon-de-livraison.md`), § 1.1) : tant
 * que chaque BL vivant est complet, sa règle est une recopie, jamais un
 * calcul. Le centime ne peut pas bouger, par construction.
 *
 * Les sept entiers vont ensemble (CHECK « tout ou rien » en base) ; les trois
 * autres suivent la commande, `null` compris pour une commande ancienne.
 */
export interface DeliveryNoteTerms {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly deliveryVatMode: string | null;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: FrozenJson | null;
  readonly vatShares: FrozenJson | null;
  readonly vatCents: number;
  readonly totalCents: number;
}

const INTEGER_FIELDS = [
  "subtotalCents",
  "discountCents",
  "voucherDiscountCents",
  "deliveryFeeCents",
  "lateFeeCents",
  "vatCents",
  "totalCents",
] as const satisfies readonly (keyof DeliveryNoteTerms)[];

/**
 * Recopie un en-tête champ par champ — une seule fonction nomme les dix,
 * pour qu'aucun ne soit oublié (plan E4a, § 4).
 *
 * @throws {InvalidDeliveryNoteTermsError} un des sept totaux n'est pas un entier.
 */
export function copyOfTerms(orderNumber: string, terms: DeliveryNoteTerms): DeliveryNoteTerms {
  const invalid = INTEGER_FIELDS.find((field) => !Number.isSafeInteger(terms[field]));
  if (invalid !== undefined) {
    throw new InvalidDeliveryNoteTermsError(orderNumber, invalid);
  }
  return {
    subtotalCents: terms.subtotalCents,
    discountCents: terms.discountCents,
    voucherDiscountCents: terms.voucherDiscountCents,
    deliveryFeeCents: terms.deliveryFeeCents,
    deliveryVatMode: terms.deliveryVatMode,
    lateFeeCents: terms.lateFeeCents,
    lateFeeAdjustment: terms.lateFeeAdjustment,
    vatShares: terms.vatShares,
    vatCents: terms.vatCents,
    totalCents: terms.totalCents,
  };
}

/** Forme canonique d'une valeur JSON : les clés d'un objet triées, pour comparer sans leur ordre. */
function canonical(value: FrozenJson): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (isJsonArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`);
  return `{${entries.join(",")}}`;
}

function isJsonArray(value: FrozenJson): value is readonly FrozenJson[] {
  return Array.isArray(value);
}

function sameJson(a: FrozenJson, b: FrozenJson): boolean {
  return canonical(a) === canonical(b);
}

/** Les champs de l'en-tête où le BL diffère de sa commande — vide s'ils sont égaux. */
export function termsDifferences(
  note: DeliveryNoteTerms,
  order: DeliveryNoteTerms,
): readonly (keyof DeliveryNoteTerms)[] {
  const scalar = [...INTEGER_FIELDS, "deliveryVatMode"] as const;
  const json = ["lateFeeAdjustment", "vatShares"] as const;
  return [
    ...scalar.filter((field) => note[field] !== order[field]),
    ...json.filter((field) => !sameJson(note[field], order[field])),
  ];
}

/** Ce qu'un BL partiel recompose : les lignes qui partent, et les règles figées de sa commande. */
export interface PartialTermsInput {
  readonly orderNumber: string;
  /** Les lignes qui partent — l'éligibilité y est celle de la LIGNE DE COMMANDE. */
  readonly lines: readonly DeliveryNoteSourceLine[];
  readonly adjustments: FrozenOrderAdjustments;
}

/**
 * **L'en-tête d'un BL partiel** (plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 9.2, § 11 et
 * § 13) — la fabrique qui tient pour un BL le rôle d'`Order.draft` : chaque
 * terme est CALCULÉ par les fonctions mêmes de la passation, sur ce qui part,
 * puis passe les mêmes gardes, puis `computeOrderTotals`. Aucune seconde
 * formule.
 *
 * - remise : `discountCentsOf` sur l'assiette ÉLIGIBLE des lignes qui partent —
 *   un pourcentage suit le livré, un montant fixe reste entier mais plafonné
 *   à cette assiette (Q-E6-2) ;
 * - frais de livraison et surtaxe : `cartAdjustmentCents` sur le sous-total qui
 *   part — un pourcentage suit le livré (Q-E6-1), un montant fixe reste
 *   entier (Q-I2) ;
 * - bon de fidélité : zéro — la décision refuse une commande qui en porte ;
 * - mode de TVA du port et taux de la surtaxe : ceux de la commande.
 *
 * @throws {InvalidOrderPaymentError} une garde refuse (ne devrait pas : les
 * termes sortent des mêmes fonctions).
 * @throws {MissingLateFeeVatRateError} surtaxe sans taux figé.
 * @throws {InvalidDeliveryNoteTermsError} un total non entier.
 */
function composePartial(input: PartialTermsInput): DeliveryNoteTerms {
  const { lines, adjustments } = input;
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const eligibleCents = lines.reduce(
    (sum, line) => (line.pickupDiscountEligible ? sum + line.lineTotalCents : sum),
    0,
  );
  const terms = {
    discountAdjustment: adjustments.discount,
    discountCents:
      adjustments.discount === null ? 0 : discountCentsOf(adjustments.discount, eligibleCents),
    deliveryFeeAdjustment: adjustments.deliveryFee,
    deliveryFeeCents:
      adjustments.deliveryFee === null
        ? 0
        : cartAdjustmentCents(adjustments.deliveryFee, subtotalCents),
    lateFeeAdjustment: adjustments.lateFee,
    lateFeeCents:
      adjustments.lateFee === null
        ? 0
        : cartAdjustmentCents(adjustments.lateFee.adjustment, subtotalCents),
  };
  ensureDiscountMatches(terms, eligibleCents);
  ensureLateFeeMatches(terms, subtotalCents);
  ensureDeliveryFeeMatches(terms, subtotalCents);
  const totals = computeOrderTotals({
    lines: lines.map((line) => ({
      htCents: line.lineTotalCents,
      vatRate: line.vatRate,
      discountEligible: line.pickupDiscountEligible,
    })),
    discountCents: terms.discountCents,
    voucherDiscountCents: 0,
    deliveryFeeCents: terms.deliveryFeeCents,
    deliveryVatMode: adjustments.deliveryVatMode,
    lateFeeCents: terms.lateFeeCents,
    lateFeeVatRate: adjustments.lateFee?.vatRatePercent ?? null,
  });
  const lateFee = adjustments.lateFee;
  return copyOfTerms(input.orderNumber, {
    subtotalCents,
    discountCents: terms.discountCents,
    voucherDiscountCents: 0,
    deliveryFeeCents: terms.deliveryFeeCents,
    deliveryVatMode: adjustments.deliveryVatMode,
    lateFeeCents: terms.lateFeeCents,
    lateFeeAdjustment:
      lateFee === null
        ? null
        : { adjustment: { ...lateFee.adjustment }, vatRatePercent: lateFee.vatRatePercent },
    vatShares: totals.vatShares.map((share) => ({
      rate: share.rate,
      amountCents: share.amountCents,
    })),
    vatCents: totals.vatCents,
    totalCents: totals.totalCents,
  });
}

/** Les fabriques de l'en-tête d'un BL — `DeliveryNoteTerms.composePartial` du plan. */
export const DeliveryNoteTerms = { composePartial } as const;
