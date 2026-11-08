/**
 * Port de **lecture** : une commande existe-t-elle sous cet identifiant ?
 *
 * Distinct d'`OrderReader` (ISP) : la fiche « E-mails » d'une commande
 * (`le-sujet-des-e-mails.md`, règle 7) n'a besoin que de prouver la
 * commande avant de lire le bloc `mail`, pas de la charger. Aucun mur
 * tenant : la route est staff, gardée par `@AdminSurface("b2b_orders")`, et
 * le staff voit toutes les commandes.
 */
export abstract class OrderExistenceReader {
  abstract exists(orderId: string): Promise<boolean>;
}
