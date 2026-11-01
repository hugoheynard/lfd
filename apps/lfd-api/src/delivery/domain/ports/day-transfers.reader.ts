/** Un transfert d'une journée, tel que la liste du jour le lit. */
export interface DayTransferRow {
  readonly id: string;
  readonly siteId: string;
  readonly siteLabel: string;
  readonly departedAt: Date | null;
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
