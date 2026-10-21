import type { OrderCutoffView } from "@lfd/contracts";

/**
 * **Les règles d'heure limite qui s'appliquent maintenant** — la règle
 * générale (la seule depuis le 2026-10-21, schéma des réglages §4 point 4),
 * toujours : l'interrupteur qui pouvait l'éteindre est retiré le 2026-10-21
 * (`limites-de-commande/plan-une-seule-heure.md` §5) — elle déclenche l'arrêt
 * du plan. Aucune tant qu'elle n'est pas posée.
 *
 * Le seul port que lisent ceux qui OPPOSENT ou SERVENT la règle : la passation
 * (`OrderCutoffReader` du contexte `orders`), la boutique (`GET
 * /fulfillment-days`), le fournil (`OrderCutoffRulesReader`) et la relance de
 * règlement. L'écran d'administration lit `StoredOrderCutoffReader`, lui.
 *
 * Rendre une liste vide plutôt qu'un drapeau est le choix : chaque lecteur
 * sait déjà que « aucune règle ⇒ rien à opposer », et aucun n'a eu à changer.
 */
export abstract class OrderCutoffsInForce {
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
