/** Une dérogation de la liste transverse, telle que la base la rend. */
export interface OpenCutoffWaiverEntry {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  /** La journée d'acheminement, `AAAA-MM-JJ`. */
  readonly fulfillmentDate: string;
  readonly reason: string;
  readonly grantedByStaffId: string;
  readonly grantedAt: Date;
  readonly usedByOrderId: string | null;
}

/**
 * Port de **lecture** des dérogations encore d'actualité, toutes sociétés
 * confondues (`documentation/commandes/passation/plan-reglages-commandes.md`, lot O1c).
 *
 * Un port à part, et pas une méthode de plus sur `OrderCutoffWaiverRepository`
 * (ISP) : la liste de Réglages ne fait que lire, et accorder ou retirer reste
 * le geste de la saisie de commande.
 *
 * Sans mur d'entreprise, comme le dépôt : c'est une surface staff, murée par
 * `b2b_order_waivers` au contrôleur.
 */
export abstract class OpenOrderCutoffWaiverReader {
  /**
   * Les dérogations dont la journée est `firstDay` ou plus tard, servies ou
   * non — la plus proche d'abord.
   */
  abstract listFrom(firstDay: string): Promise<readonly OpenCutoffWaiverEntry[]>;
}
