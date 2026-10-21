import {
  decideOrderCutoff,
  decideOrderLimit,
  type OrderCutoffView,
  type OrderLimitSpec,
} from "@lfd/contracts";

/** Le jour de service visé et le point de retrait, quand le client les a choisis. */
export interface FulfillmentTarget {
  /** `YYYY-MM-DD`, jour de Paris. */
  readonly date: string;
  /** `null` en livraison : seule la règle générale du commerce s'applique. */
  readonly pickupAddressId: string | null;
}

/** Ce que le filtre lit d'un article servi. */
export interface OrderableCandidate {
  readonly sku: string;
  readonly orderTimeLimit: OrderLimitSpec | null;
}

/**
 * **Garde les candidats qu'on peut encore commander pour ce jour**, dans
 * l'ordre reçu, sans doublon, sans ce qui est déjà au panier (R4).
 *
 * La même décision que la garde de passation (`order-cutoff-guard.ts`) : la
 * limite de l'article si elle existe, sinon la règle du commerce. Mais un
 * article est gardé seulement s'il est **ouvert** — en rattrapage, il ne
 * passerait qu'avec une dérogation, et une suggestion ne montre jamais ce
 * qu'un clic ne peut pas commander.
 *
 * Sans jour visé (`target === null`), il n'y a pas d'heure à opposer : c'est
 * ce que fait la passation, qui ne juge l'heure que lorsqu'il y a une date.
 * Une liste vide reste vide — jamais de remplissage.
 */
export function keepOrderable<T extends OrderableCandidate>(
  input: OrderableInput<T>,
): readonly T[] {
  return judgeOrderable(input).flatMap((verdict) =>
    verdict.refusal === null ? [verdict.candidate] : [],
  );
}

/** Ce que `keepOrderable` reçoit. */
export interface OrderableInput<T extends OrderableCandidate> {
  readonly candidates: readonly T[];
  readonly inCart: ReadonlySet<string>;
  readonly target: FulfillmentTarget | null;
  readonly fallback: readonly OrderCutoffView[];
  readonly now: Date;
}

/** Pourquoi un candidat servi n'est pas gardé — `duplicate` ne se montre jamais. */
export type OrderableRefusal = "item_in_cart" | "item_not_orderable_that_day" | "duplicate";

/**
 * Le sort de chaque candidat, dans l'ordre reçu : gardé (`refusal === null`)
 * ou écarté, avec sa raison. `keepOrderable` n'en garde que les gardés ;
 * l'aperçu du staff (RS5) lit les raisons.
 */
export function judgeOrderable<T extends OrderableCandidate>(
  input: OrderableInput<T>,
): readonly { readonly candidate: T; readonly refusal: OrderableRefusal | null }[] {
  const seen = new Set<string>();
  return input.candidates.map((candidate) => {
    if (input.inCart.has(candidate.sku)) {
      return { candidate, refusal: "item_in_cart" as const };
    }
    if (seen.has(candidate.sku)) {
      return { candidate, refusal: "duplicate" as const };
    }
    seen.add(candidate.sku);
    const open =
      input.target === null || isOpen(candidate, input.target, input.fallback, input.now);
    return { candidate, refusal: open ? null : ("item_not_orderable_that_day" as const) };
  });
}

function isOpen(
  candidate: OrderableCandidate,
  target: FulfillmentTarget,
  fallback: readonly OrderCutoffView[],
  now: Date,
): boolean {
  const decision =
    candidate.orderTimeLimit === null
      ? decideOrderCutoff(fallback, target.date, now)
      : decideOrderLimit(candidate.orderTimeLimit, target.date, now);
  return decision.status === "open";
}
