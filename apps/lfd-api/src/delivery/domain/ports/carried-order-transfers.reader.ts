/** Le transfert qui porte une commande, et où il en est (diagramme du §3 du plan). */
export interface CarriedOrderTransferRow {
  readonly transferId: string;
  readonly siteLabel: string;
  readonly state: "planned" | "departed" | "received";
  /** L'instant de l'état : ouverture, départ ou réception. */
  readonly at: Date;
}

/**
 * **Quel transfert porte ces commandes ?** (lots T2, T3 du transfert
 * interne) — seuls les éléments PORTÉS comptent : un élément sorti
 * n'engage plus la commande. Une lecture, qui ne verrouille rien.
 */
export abstract class CarriedOrderTransfers {
  /** Parmi ces commandes, celles qu'un transfert porte ; les autres sont absentes. */
  abstract carriedAmong(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, CarriedOrderTransferRow>>;
}
