import type { ReportingSite } from "../order-problem-reported.fact.js";

/** Une commande que le demandeur a le droit de voir, réduite à ce qu'un signalement en lit. */
export interface ReportableOrder {
  readonly id: string;
  readonly number: string;
  /**
   * La société DE LA COMMANDE, `null` pour une commande personnelle. C'est
   * elle qui fait foi pour l'audience et la société de la demande — jamais
   * l'espace de travail (`plan-commandes-des-sites.md`, §7.3).
   */
  readonly companyId: string | null;
  /** Retirée ou livrée (`status === 'fulfilled'`, la source du suivi). */
  readonly fulfilled: boolean;
  /**
   * La société de la commande et son principal COPIÉ à la passation, ou
   * `null` : commande personnelle (N4a de `plan-notifications-sous-comptes.md`).
   */
  readonly site: ReportingSite | null;
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
