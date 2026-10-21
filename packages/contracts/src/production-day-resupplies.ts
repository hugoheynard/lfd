/**
 * **Les réassorts d'une journée, tels que le dossier du jour les montre**
 * (lot R3d du réassort, `documentation/reassort-boutiques/plan-reapprovisionnement.md`).
 *
 * Une journée arrêtée rend ses réassorts FIGÉS (`frozen: true`) — ceux que la
 * feuille et le PDF impriment. Une journée ouverte rend ceux qui sont envoyés
 * « pour demain » à ce jour (`frozen: false`) : l'écran les montre, distingués,
 * pour que ce que compte le prévisionnel se retrouve au dossier. Aucun prix.
 */
export interface ProductionDayResupplyLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Un réassort pour un point. */
export interface ProductionDayResupply {
  /** L'identifiant du réassort au commerce, opaque. */
  readonly resupplyId: string;
  readonly siteId: string;
  /** Le nom du point ; `null` : inconnu. */
  readonly siteLabel: string | null;
  /** Servi par un transfert (Village) ; `false` : servi sur place (Labo). */
  readonly servedByTransfer: boolean;
  readonly lines: readonly ProductionDayResupplyLine[];
}

export interface ProductionDayResuppliesView {
  /** `AAAA-MM-JJ`, la journée servie. */
  readonly date: string;
  /** `true` : la copie figée à l'arrêt ; `false` : l'envoyé, vivant. */
  readonly frozen: boolean;
  readonly resupplies: readonly ProductionDayResupply[];
}
