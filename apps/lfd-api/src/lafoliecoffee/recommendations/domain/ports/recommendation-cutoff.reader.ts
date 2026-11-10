import type { OrderCutoffView } from "@lfd/contracts";

/**
 * Port de **lecture** des règles d'heure limite du commerce, vu par la
 * recommandation : la règle qu'on oppose à un article sans limite propre.
 *
 * Déclaré ici plutôt que d'emprunter celui d'`orders` : une recommandation
 * ne compose pas de commande. L'implémentation est celle d'`order-cutoffs`
 * (`OrderCutoffsInForce`), reliée dans le module.
 */
export abstract class RecommendationCutoffReader {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
