/** Le plan arrêté d'une journée, tel que l'écran des tournées le lit. */
export interface DeliveryDayReadinessRow {
  /** Nul : aucune clôture reçue encore (un retirage seul, CA6b). */
  readonly closedAt: Date | null;
  readonly deliveryCount: number;
  /** Celles de l'ensemble qu'aucun arrêt vivant d'une tournée du jour ne porte. */
  readonly unplacedCount: number;
}

/**
 * La lecture du plan arrêté (CA6a), à part de son écriture (ISP) : l'écran ne
 * verrouille rien et ne voit pas l'agrégat.
 */
export abstract class DeliveryDayReadinessReader {
  /** `null` : la livraison n'a rien appris de cette journée. */
  abstract readinessOf(serviceDay: string): Promise<DeliveryDayReadinessRow | null>;
}
