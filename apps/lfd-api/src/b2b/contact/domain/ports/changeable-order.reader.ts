/**
 * Où en est une commande pour une **demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4) — ce que la
 * règle de la modification en dit pour ce client, réduit à ce que la demande
 * tranche :
 *
 * - `too_late` : l'heure limite est passée, la commande n'est pas au plan —
 *   le SEUL cas où l'on demande ;
 * - `revisable` : le client la modifie encore lui-même ;
 * - `closed` : tout autre refus (au plan, carte, engagée, close…).
 */
export type ChangeStanding = "too_late" | "revisable" | "closed";

/** Une commande que le demandeur a le droit de voir, réduite à ce qu'une demande de modification en lit. */
export interface ChangeableOrder {
  readonly id: string;
  readonly number: string;
  /** La société DE LA COMMANDE, `null` pour une commande personnelle (`plan-commandes-des-sites.md`, §7.3). */
  readonly companyId: string | null;
  /** La révision courante. */
  readonly revision: number;
  readonly standing: ChangeStanding;
}

/**
 * Port de **lecture** de la commande dont on demande la modification. Son
 * adaptateur applique LA règle d'accès d'une commande et LA règle de la
 * modification, celles des commandes — pas des secondes.
 */
export abstract class ChangeableOrderReader {
  /** La commande si ce client peut la voir ; `null` si elle n'existe pas ou n'est pas à lui. */
  abstract visibleTo(orderId: string, actorUserId: string): Promise<ChangeableOrder | null>;
}
