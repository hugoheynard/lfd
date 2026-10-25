/**
 * L'en-tête d'une commande telle que le fournil l'a figée au plan — de quoi
 * poser une feuille du colisage sans ses lignes.
 */
export interface InscribedOrderHeader {
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** `HH:mm`, ou `null` : aucune échéance figée. */
  readonly dueAt: string | null;
  /** `pro` / `public`, ou `null` : figée avant la colonne. */
  readonly clientele: "pro" | "public" | null;
  /** Le site qui remet (identifiant opaque du commerce), ou `null`. */
  readonly siteId: string | null;
}

/**
 * **« Que dit le plan de cette commande ? »** — port que le fournil PUBLIE et
 * implémente, que le colisage lit pour poser la pierre tombale d'une feuille
 * retirée avant que la liste à coliser ne soit arrivée (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.2 ; les colonnes descriptives viennent de l'instantané du fournil,
 * décision reprise de C7 § 3.3).
 *
 * Même figure que {@link PlannedDestinationsReader} : le colisage demande au
 * fournil ce que lui seul a figé, plutôt que d'en inventer.
 */
export abstract class InscribedOrderHeaderReader {
  /** `null` : la commande n'est pas inscrite à cette journée. */
  abstract headerOf(serviceDay: string, orderId: string): Promise<InscribedOrderHeader | null>;
}
