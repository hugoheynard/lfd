/** Un transfert d'une journée, tel que la liste du jour le lit. */
export interface DayTransferRow {
  readonly id: string;
  readonly siteId: string;
  readonly siteLabel: string;
  readonly departedAt: Date | null;
  /**
   * Le départ prévu de la tournée qui porte son arrêt vivant ; `null` : il
   * n'est dans aucune tournée, ou la tournée n'a pas de départ prévu.
   */
  readonly plannedDepartureAt: Date | null;
  /** Un arrêt vivant le porte : il est placé dans une tournée. */
  readonly placed: boolean;
  /** Les commandes et réassorts qu'il porte encore. */
  readonly orderCount: number;
  readonly resupplyCount: number;
}

/**
 * **Les transferts internes d'une journée** (2026-11-01) — port de lecture à
 * part (ISP) : le colisage et la Supervision n'ont besoin que de reconnaître
 * le transfert d'un site pour ouvrir son manifeste, pas de l'agrégat.
 */
export abstract class DayTransfersReader {
  /** Ceux qui portent au moins un élément, par site puis du plus ancien au plus récent. */
  abstract transfersOn(serviceDay: string): Promise<readonly DayTransferRow[]>;
}
