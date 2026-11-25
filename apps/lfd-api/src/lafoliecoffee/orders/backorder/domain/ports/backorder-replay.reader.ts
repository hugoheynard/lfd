import type { ReplayableOrder } from "../../../domain/services/basket-discount-replay.js";
import type { OrderLineSnapshot } from "../../../domain/value-objects/order-line.js";

/**
 * **Ce que la commande d'origine porte pour rejouer son prix** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) : ses
 * lignes figées et ses remises actives, colonnes `discount_*` comprises. Les
 * lignes ne bougent plus après la décision du départ : la révision est
 * refusée dès qu'une décision existe.
 */
export interface BackorderOriginReplay {
  /** Le numéro de la commande d'origine : le libellé du fait au journal. */
  readonly originOrderNumber: string;
  readonly lines: readonly OrderLineSnapshot[];
  readonly replayable: ReplayableOrder;
}

/**
 * Port de **lecture** du prix d'origine d'un reliquat, que la transformation
 * et son estimation lisent. Séparé de `BackorderOriginReader` (la naissance,
 * sous le verrou de la décision) : aucun des deux consommateurs n'appelle
 * l'autre question.
 */
export abstract class BackorderReplayReader {
  /** `null` : commande d'origine inconnue. Sans verrou. */
  abstract replayOf(originOrderId: string): Promise<BackorderOriginReplay | null>;
}
