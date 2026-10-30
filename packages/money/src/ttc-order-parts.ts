import type { TtcComposedTerm, TtcOrderComposition, TtcRatePart } from "./ttc-order.js";

/**
 * Les parts par taux d'une composition `composeTtcOrder` — sommes et signes,
 * sortis de `ttc-order.ts` quand la liste des remises de panier l'a fait
 * grossir (plan des promotions, § 18, lot M1).
 */

export function pushPart(
  target: TtcRatePart[],
  vatRate: number,
  term:
    { readonly ttcCents: number; readonly vatCents: number; readonly htCents: number } | undefined,
  sign: 1 | -1,
): void {
  if (term !== undefined && term.ttcCents !== 0) {
    target.push({
      vatRate,
      ttcCents: sign * term.ttcCents,
      vatCents: sign * term.vatCents,
      htCents: sign * term.htCents,
    });
  }
}

export function sumParts(
  vatRate: number,
  terms: readonly {
    readonly ttcCents: number;
    readonly vatCents: number;
    readonly htCents: number;
  }[],
): TtcRatePart {
  return terms.reduce<TtcRatePart>(
    (acc, t) => ({
      vatRate,
      ttcCents: acc.ttcCents + t.ttcCents,
      vatCents: acc.vatCents + t.vatCents,
      htCents: acc.htCents + t.htCents,
    }),
    { vatRate, ttcCents: 0, vatCents: 0, htCents: 0 },
  );
}

export function totalOf(byRate: readonly TtcRatePart[]): TtcOrderComposition["total"] {
  const { ttcCents, vatCents, htCents } = sumParts(0, byRate);
  return { ttcCents, vatCents, htCents };
}

/** Les parts de plusieurs étapes, sommées par taux, par taux croissant. */
export function mergedByRate(parts: readonly TtcRatePart[]): readonly TtcRatePart[] {
  const rates = [...new Set(parts.map((part) => part.vatRate))].sort((a, b) => a - b);
  return rates.map((rate) =>
    sumParts(
      rate,
      parts.filter((part) => part.vatRate === rate),
    ),
  );
}

export function termOf(parts: readonly TtcRatePart[]): TtcComposedTerm {
  const { ttcCents, vatCents, htCents } = sumParts(0, parts);
  return { ttcCents, vatCents, htCents, parts };
}
