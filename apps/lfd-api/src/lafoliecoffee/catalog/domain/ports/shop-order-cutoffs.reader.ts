import type { OrderCutoffView } from "@lfd/contracts";

/**
 * Port de **lecture** des heures limites EN VIGUEUR, vu par la vitrine (Hugo,
 * 2026-10-21 — `limites-de-commande/limites-produit.md` §4) : la fiche
 * produit ne montre la limite d'un article que si elle est plus stricte que la
 * règle générale, et il faut donc la connaître.
 *
 * Étroit : la vitrine ne règle rien. Implémenté par `OrderCutoffsInForce`
 * — tant qu'aucune règle générale n'est posée, il n'en rend aucune, et toute
 * limite d'article devient la plus stricte.
 */
export abstract class ShopOrderCutoffsReader {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
