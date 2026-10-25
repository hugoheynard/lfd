import type { VatShare } from "@lfd/money";

/**
 * **Les montants facturables** d'une commande (plan
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.3, E6c1) — la
 * forme des totaux d'une commande, et celle de l'en-tête d'un bon de
 * livraison : la somme des BL remis en a la même. La ventilation est `null`
 * pour une commande d'avant le 2026-09-07, jamais reconstituée.
 */
export interface BillableAmounts {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  readonly vatShares: readonly VatShare[] | null;
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
] as const satisfies readonly (keyof BillableAmounts)[];

/** La TVA par taux additionnée, du plus bas au plus haut ; `null` dès qu'une part manque. */
function sumShares(shares: readonly (readonly VatShare[] | null)[]): readonly VatShare[] | null {
  if (shares.some((share) => share === null)) {
    return null;
  }
  const byRate = new Map<number, number>();
  for (const share of shares.flatMap((list) => list ?? [])) {
    byRate.set(share.rate, (byRate.get(share.rate) ?? 0) + share.amountCents);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, amountCents]) => ({ rate, amountCents }));
}

/** La somme de plusieurs en-têtes — Σ des BL remis (§ 12.3). Une seule : elle-même. */
export function sumOfAmounts(parts: readonly BillableAmounts[]): BillableAmounts {
  const total = (field: (typeof INTEGER_FIELDS)[number]): number =>
    parts.reduce((sum, part) => sum + part[field], 0);
  return {
    subtotalCents: total("subtotalCents"),
    discountCents: total("discountCents"),
    voucherDiscountCents: total("voucherDiscountCents"),
    deliveryFeeCents: total("deliveryFeeCents"),
    lateFeeCents: total("lateFeeCents"),
    vatCents: total("vatCents"),
    vatShares: sumShares(parts.map((part) => part.vatShares)),
    totalCents: total("totalCents"),
  };
}

function sameShares(a: readonly VatShare[] | null, b: readonly VatShare[] | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const key = (shares: readonly VatShare[]): string =>
    [...shares]
      .sort((x, y) => x.rate - y.rate)
      .map((share) => `${String(share.rate)}:${String(share.amountCents)}`)
      .join(",");
  return key(a) === key(b);
}

/** Les champs où deux jeux de montants diffèrent — vide s'ils sont égaux. */
export function amountDifferences(
  actual: BillableAmounts,
  expected: BillableAmounts,
): readonly (keyof BillableAmounts)[] {
  return [
    ...INTEGER_FIELDS.filter((field) => actual[field] !== expected[field]),
    ...(sameShares(actual.vatShares, expected.vatShares) ? [] : (["vatShares"] as const)),
  ];
}
