/**
 * **Le montant au compte suit la commande modifiée** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.6 « L'argent au compte » : « le
 * compte ») — port que la commande DÉCLARE et que la comptabilité implémente,
 * à côté de `AccountOrderEngagement` et pour la même raison : la ligne
 * d'encaissement appartient à la comptabilité.
 *
 * Séparé de `AccountOrderEngagement` (ISP) : l'annulation n'en a pas besoin,
 * la révision n'a besoin que de lui.
 *
 * Appelé dans l'unité de travail de la révision, sous le verrou de la ligne
 * `orders`, et seulement APRÈS que la règle a relu l'engagement `free` sous
 * ce même verrou : une ligne engagée ne se réévalue pas.
 */
export abstract class AccountOrderRevaluation {
  /** Recale la ligne d'encaissement ouverte sur `amountCents` ; rien s'il n'y en a pas encore. */
  abstract revalue(orderId: string, amountCents: number, at: Date): Promise<void>;
}
