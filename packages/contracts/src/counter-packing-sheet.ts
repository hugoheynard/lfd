/**
 * **La fiche de colis d'UNE commande, vue du comptoir** —
 * `GET /admin/counter/orders/:orderId/packing-sheet`, sous `handover_counter:read`.
 *
 * Constaté le 2026-11-03 sur le dev : le rail du comptoir lisait tout le
 * poste de la journée (`GET /admin/packing/:date/board`, centaines de Ko) pour
 * n'en garder qu'une fiche, et cette route exige un droit du colisage ou de la
 * Supervision. Un vendeur qui n'avait que le comptoir prenait un 403, le rail
 * croyait qu'il n'y avait pas de fiche, et proposait « Remettre la commande »
 * — qui facture la commande entière — au lieu de la procédure incomplète.
 *
 * La vue est RÉDUITE à ce que le rail lit (barres du sac, coches par ligne,
 * compte de pièces) : rien du rangement, des contenants ni des auteurs du
 * poste. Les chiffres sont ceux de `PackingSheet`, calculés par la même règle
 * au serveur.
 */
export interface CounterPackingSheetLine {
  readonly sku: string;
  /** Des pièces, ou des grammes sur une ligne au poids (P6). */
  readonly quantity: number;
  /** La ligne est cochée au bac. */
  readonly packed: boolean;
  /** Pas encore sorti du four — la règle de `PackingLine.awaitingProduction`. */
  readonly awaitingProduction: boolean;
  /** Les pièces de la ligne déjà réparties dans les contenants. */
  readonly allocated: number;
}

/** La fiche du rang 1 la plus récente de la commande — voir le fichier. */
export interface CounterPackingSheetView {
  readonly orderId: string;
  readonly reference: string;
  readonly lineCount: number;
  readonly packedLines: number;
  /** Les pièces posées, lignes ouvertes comprises (`PackingSheet.packedPieces`). */
  readonly packedPieces: number;
  /** ISO 8601 — le bac fermé ; `null` tant qu'il ne l'est pas. */
  readonly packedAt: string | null;
  readonly lines: readonly CounterPackingSheetLine[];
}
