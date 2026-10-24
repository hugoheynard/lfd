import { InvalidDeliveryNoteTermsError } from "../errors/delivery-note-errors.js";

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
 * (plan `documentation/commandes/plan-e4a-totaux-du-bon.md`, § 1.1) : tant
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
