import type { OrderCutoffView } from "@lfd/contracts";

/**
 * **Les règles d'heure limite qui s'appliquent maintenant** — celles de la
 * table, ou AUCUNE quand l'heure limite générale est désactivée (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8.1, S3/S4).
 *
 * Le seul port que lisent ceux qui OPPOSENT ou SERVENT la règle : la passation
 * (`OrderCutoffReader` du contexte `orders`), la boutique (`GET
 * /fulfillment-days`), le fournil (`OrderCutoffRulesReader`) et la relance de
 * règlement. L'écran d'administration lit `OrderCutoffRepository`, lui : il
 * montre la règle même quand elle dort, pour qu'on sache ce que la réactivation
 * remettra.
 *
 * Rendre une liste vide plutôt qu'un drapeau est le choix : chaque lecteur
 * sait déjà que « aucune règle ⇒ rien à opposer », et aucun n'a eu à changer.
 */
export abstract class OrderCutoffsInForce {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
