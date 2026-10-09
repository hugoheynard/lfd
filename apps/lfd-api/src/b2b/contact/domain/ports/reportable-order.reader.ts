/** Une commande que le demandeur a le droit de voir, réduite à ce qu'un signalement en lit. */
export interface ReportableOrder {
  readonly id: string;
  readonly number: string;
  /** Retirée ou livrée (`status === 'fulfilled'`, la source du suivi). */
  readonly fulfilled: boolean;
}

/**
 * Port de **lecture** de la commande signalée (`demandes-clients.md`,
 * §6.4). Son adaptateur applique LA règle d'accès d'une commande — celle de
 * `get-order.handler.ts` —, pas une seconde.
 */
export abstract class ReportableOrderReader {
  /** La commande si ce client peut la voir ; `null` si elle n'existe pas ou n'est pas à lui. */
  abstract visibleTo(orderId: string, actorUserId: string): Promise<ReportableOrder | null>;
}
