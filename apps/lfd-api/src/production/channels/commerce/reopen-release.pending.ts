import type { ServiceDay } from "../../day/domain/value-objects/service-day.value-object.js";

/**
 * **« La remise de la réouverture est-elle faite ? »** — port de LECTURE que le
 * fournil déclare et que le commerce implémente
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 5).
 *
 * La réouverture défait l'arrêt ; le commerce remet ensuite en `placed`, par
 * un abonné durable, les commandes qu'il avait confirmées à l'instant de cet
 * arrêt. Le nouvel arrêt ne lit que `placed` : passé avant la remise, il
 * laisserait ces commandes hors de tout plan, et l'abonné, voyant la journée
 * de nouveau arrêtée, ne ferait plus rien. L'arrêt pose donc la question sous
 * son verrou, après une réouverture seulement, et refuse tant que la réponse
 * est « oui ».
 *
 * La réponse se lit avec la condition même de la remise : une commande que la
 * remise ne rendrait pas (prête, manque décidé) n'est jamais « en attente ».
 *
 * `production → lafoliecoffee` reste interdit : le fournil ne sait pas qui
 * répond.
 */
export abstract class ReopenReleasePending {
  /**
   * `true` si des commandes de `day`, confirmées à `undoneClosedAt` (l'arrêt
   * que la réouverture a défait), restent à remettre en `placed`.
   */
  abstract pendingFor(day: ServiceDay, undoneClosedAt: Date): Promise<boolean>;
}
