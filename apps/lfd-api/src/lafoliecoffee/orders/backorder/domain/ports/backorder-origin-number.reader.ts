/**
 * Port de **lecture** du numéro de la commande d'origine d'un reliquat : le
 * libellé des faits `backorder.*` au journal (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 2).
 */
export abstract class BackorderOriginNumberReader {
  /** `null` : commande inconnue — sa clé étrangère l'interdit. */
  abstract numberOf(originOrderId: string): Promise<string | null>;
}
