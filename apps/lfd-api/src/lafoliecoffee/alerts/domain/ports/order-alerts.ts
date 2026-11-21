import type { StoredAccountAlert } from "./account-alert.repository.js";

/**
 * **Ce que les alertes savent répondre sur des commandes** — une lecture
 * nommée, par lot (plan du visa des commandes, V4) : l'onglet « À vérifier »
 * déplie les alertes de sa page en une requête. Le commerce ne lit pas la
 * table des alertes ; il appelle cette route.
 */
export abstract class AlertsOfOrders {
  /** Les alertes de ces commandes, la plus récente en tête ; acquittées comprises. */
  abstract of(orderIds: readonly string[]): Promise<StoredAccountAlert[]>;
}

/**
 * **Acquitter les alertes d'une commande** — le geste que le visa déclenche.
 * Un port à part du journal (ISP) : seul l'abonné du visa l'appelle.
 */
export abstract class OrderAlertsAcknowledger {
  /**
   * Acquitte les alertes **encore en attente** de la commande : une alerte
   * déjà acquittée garde son premier auteur. Rejoué, ne change rien.
   */
  abstract acknowledgeOrder(orderId: string, staffUserId: string, at: Date): Promise<void>;
}
