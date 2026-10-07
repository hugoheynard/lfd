import type { OrderOutOfHand } from "../../domain/services/order-out-of-hand.js";

export type { OrderOutOfHand };

/**
 * **Ce que le fournil a besoin de savoir de la garde** : lesquelles de ces
 * commandes ne sont plus là (`documentation/livraisons/livreur/a-la-porte.md`,
 * § 10 ter, BQ).
 *
 * LB-Q1, tranché par Hugo le 2026-10-01 : « on ne peut pas faire de contrôle
 * qualité sur les commandes d'une tournée partie, car nous ne sommes plus en
 * présence du produit ». Une commande déjà retirée est dans le même cas.
 *
 * Même sens que `AttestedHandoversReader` : la production DÉCLARE, le retrait
 * implémente (il tient la garde — sa clé est la commande). Le fournil ne
 * connaît ni la livraison (`production → delivery` ✗) ni le retrait
 * (`production → handover` ✗) : il pose la question, `appBootstrap` relie.
 *
 * Par lot, comme les deux autres pièces du canal.
 */
export abstract class OrderCustodyReader {
  /**
   * Les commandes de `orderIds` qui ne sont plus au fournil, et pourquoi.
   * Absente de la réponse : toujours là. Retirée l'emporte sur partie — c'est
   * le dernier état.
   */
  abstract outOfHand(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderOutOfHand>>;
}
