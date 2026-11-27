/**
 * **« Parmi ces commandes, lesquelles le fournil a-t-il inscrites ? »** — port
 * de LECTURE par lot que le fournil déclare et implémente, pour le commerce.
 *
 * Il sert l'AFFICHAGE de la liste staff : une commande saisie hors plan puis
 * intégrée par un retirage reste `placed` au commerce, mais le fournil la
 * produit déjà ; l'écran éteint son badge « hors plan » sur cette réponse.
 *
 * Distinct d'{@link OrderInscriptionReader} (ISP) : celui-là rend le jour d'une
 * seule commande, celui-ci une page entière en une lecture.
 */
export abstract class InscribedOrdersReader {
  /** Les identifiants de `orderIds` inscrits au plan (premier envoi). */
  abstract inscribedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
