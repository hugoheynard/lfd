/** Une quantité qui part, par article — ce que le commerce a décidé. */
export interface DepartingLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le guichet du départ incomplet** (lot E6b, plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2 et § 13) —
 * déclaré ET implémenté par le colisage, appelé par le commerce DANS la
 * transaction de sa décision, après le verrou de la commande (ordre des
 * verrous : commande, puis fiche).
 *
 * `authorize` verrouille la fiche de la commande, vérifie que le bac contient
 * exactement les quantités décidées, réduit les lignes dues à ces quantités,
 * et lève la marque « manque » — SANS publier `packing.shortfall_cleared` :
 * le commerce résout lui-même son signal. Refus nommés (409) : pas de fiche,
 * bac déjà fermé complet, contenu changé depuis le signal.
 */
export abstract class ShortfallDesk {
  abstract authorize(
    orderId: string,
    departing: readonly DepartingLine[],
    decidedBy: string,
  ): Promise<void>;
}
