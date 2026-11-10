import type { OrderCutoffView } from "@lfd/contracts";

/**
 * Port de **lecture** des heures limites EN VIGUEUR, vu par la vitrine (Hugo,
 * 2026-10-21 — `limites-de-commande/limites-produit.md` §4) : la fiche
 * produit ne montre la limite d'un article que si elle est plus stricte que la
 * règle générale, et il faut donc la connaître.
 *
 * Étroit comme `OrderCutoffReader` du contexte `orders` : la vitrine ne règle
 * rien. Implémenté par `OrderCutoffsInForce` — l'interrupteur de l'heure
 * limite générale compris : désactivée, il n'y a plus de règle générale, et
 * toute limite d'article devient la plus stricte.
 */
export abstract class ShopOrderCutoffsReader {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
