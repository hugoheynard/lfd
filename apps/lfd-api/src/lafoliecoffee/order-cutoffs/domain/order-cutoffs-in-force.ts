import type { OrderCutoffView } from "@lfd/contracts";

/**
 * **Les règles d'heure limite qui s'appliquent maintenant** — la règle
 * générale, la seule (schéma des réglages §4 point 4), toujours en vigueur :
 * elle déclenche l'arrêt du plan. Aucune tant qu'elle n'est pas posée.
 *
 * Le seul port que lisent ceux qui OPPOSENT ou SERVENT la règle : le verdict
 * du délai de commande (`OrderDeadline`), la boutique (`GET /fulfillment-days`,
 * la vitrine) et le fournil (`OrderCutoffRulesReader`). L'écran
 * d'administration lit `StoredOrderCutoffReader`, lui.
 *
 * Rendre une liste vide plutôt qu'un drapeau est le choix : chaque lecteur
 * sait déjà que « aucune règle ⇒ rien à opposer ».
 */
export abstract class OrderCutoffsInForce {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
