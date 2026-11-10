/**
 * **L'encaissement suit le solde** (plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`),
 * § 4 BLOQUANT 5) — port que la commande DÉCLARE et que la comptabilité
 * implémente, comme `AccountOrderRevaluation` : la ligne d'encaissement lui
 * appartient.
 *
 * Séparé de la réévaluation (ISP) : elle REFUSE une ligne engagée, parce
 * qu'une révision n'a pas le droit de passer ; le solde, lui, ne refuse
 * rien — il se pose à la remise, et une ligne engagée (ni `due` ni `excluded`) garde
 * simplement son montant.
 *
 * Appelé dans l'unité de travail du solde, sous le verrou de la ligne
 * `orders`, juste après la pose des montants facturables.
 */
export abstract class AccountOrderSettlement {
  /** Recale la ligne d'encaissement ouverte (`due`/`excluded`) sur le montant facturable ; rien sinon. */
  abstract alignOnSettlement(orderId: string, amountCents: number, at: Date): Promise<void>;
}
