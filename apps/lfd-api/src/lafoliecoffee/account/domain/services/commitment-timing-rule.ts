import {
  ChorusRoutingQuoteWithoutMercurialeError,
  ChorusRoutingTimingLockedError,
} from "../errors/chorus-routing-errors.js";
import type { ChorusRouting } from "../value-objects/chorus-routing.js";

/** Ce que les autres contextes savent du payeur au jour du geste. */
export interface CommitmentTimingFacts {
  /** Une mercuriale agit chez lui à cet instant (pricing). */
  readonly liveMercuriale: boolean;
  /** Une commande à son compte n'est pas encore facturée (accounting). */
  readonly uninvoicedOrders: boolean;
}

/**
 * **Le changement du moment de l'engagement** (QD1) : refusé tant qu'une
 * commande au compte du payeur n'est pas facturée — elle a été passée sous
 * l'autre mode. Passer au devis de période exige en plus une mercuriale
 * active : l'organisme engage son budget sur des prix convenus. Reposer le
 * même mode n'est pas un changement, et rien n'est vérifié.
 *
 * @throws {ChorusRoutingQuoteWithoutMercurialeError} pas de mercuriale active.
 * @throws {ChorusRoutingTimingLockedError} une commande du payeur n'est pas facturée.
 */
export function ensureCommitmentTimingAccepted(
  companyId: string,
  next: ChorusRouting,
  current: ChorusRouting | null,
  facts: CommitmentTimingFacts,
): void {
  if (!next.changesTimingFrom(current)) {
    return;
  }
  if (next.onPeriodQuote && !facts.liveMercuriale) {
    throw new ChorusRoutingQuoteWithoutMercurialeError(companyId);
  }
  if (facts.uninvoicedOrders) {
    throw new ChorusRoutingTimingLockedError(companyId);
  }
}
