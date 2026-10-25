/**
 * **« Dans quelle tournée, à quel rang ? »** — ce que la feuille de route du
 * retrait demande à la livraison (décision de Hugo du 2026-10-06 : chaque
 * arrêt de la Feuille de route dit sa tournée et son rang).
 *
 * Déclaré ET implémenté par la livraison, comme `ContainerManagedOrders` l'est
 * par le colisage : la livraison possède les tournées, le retrait ne fait que
 * lire. `delivery → handover` reste interdit ; ce port ne le demande pas.
 */
export abstract class RoundPlacementsReader {
  /**
   * Les tournées composées le jour `day`, et la place de chacune de
   * `orderIds` dans sa tournée. Une commande absente de `byOrder` n'est
   * placée dans aucune tournée.
   */
  abstract placementsOf(day: string, orderIds: readonly string[]): Promise<RoundPlacements>;
}

/** Le résultat d'une seule question, pour tout le lot. */
export interface RoundPlacements {
  /** Tournées composées le jour demandé. */
  readonly roundCount: number;
  readonly byOrder: ReadonlyMap<string, RoundPlacement>;
}

/** Une commande dans sa tournée. */
export interface RoundPlacement {
  readonly roundId: string;
  /** « Kangoo blanc », puis « Kangoo blanc · passage 2 » — la règle du papier et de l'écran. */
  readonly label: string;
  /** Le rang de l'arrêt, à partir de 1. */
  readonly position: number;
  /**
   * Le départ que le calcul routier a prévu, ou `null` : aucun horaire posé,
   * ou effacé par un geste à la main (ajouté le 2026-10-25 pour la Supervision).
   */
  readonly plannedDepartureAt: Date | null;
  /** Partie le, ou `null` tant que la tournée est au dépôt. */
  readonly departedAt: Date | null;
  /** Au moins un bac de cet arrêt est chargé dans la camionnette. */
  readonly loaded: boolean;
}
