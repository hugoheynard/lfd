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
export function keepOrderable<T extends OrderableCandidate>(input: {
  readonly candidates: readonly T[];
  readonly inCart: ReadonlySet<string>;
  readonly target: FulfillmentTarget | null;
  readonly fallback: readonly OrderCutoffView[];
  readonly now: Date;
}): readonly T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const candidate of input.candidates) {
    if (seen.has(candidate.sku) || input.inCart.has(candidate.sku)) {
      continue;
    }
    seen.add(candidate.sku);
    if (input.target === null || isOpen(candidate, input.target, input.fallback, input.now)) {
      kept.push(candidate);
    }
  }
  return kept;
}

function isOpen(
  candidate: OrderableCandidate,
  target: FulfillmentTarget,
  fallback: readonly OrderCutoffView[],
  now: Date,
): boolean {
  const decision =
    candidate.orderTimeLimit === null
      ? decideOrderCutoff(fallback, target.pickupAddressId, target.date, now)
      : decideOrderLimit(candidate.orderTimeLimit, target.date, now);
  return decision.status === "open";
}
