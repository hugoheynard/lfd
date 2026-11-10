/**
 * Ce que l'avis au principal dit d'une commande
 * (`plan-notifications-sous-comptes.md`, §2, N2). Tout est lu sur la
 * commande elle-même : le principal et son droit au montant y sont COPIÉS à
 * la passation, et ne se relisent jamais dans la hiérarchie.
 */
export interface OrderNoticeSummary {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La société qui a commandé, ou `null` (commande personnelle). */
  readonly companyId: string | null;
  /** Son nom d'usage : l'enseigne, à défaut la raison sociale. `null` sans société. */
  readonly companyName: string | null;
  /** Le principal copié à la passation, ou `null` : personne à prévenir. */
  readonly principalCompanyId: string | null;
  /** Copié à la passation (Q1) ; une commande d'avant la colonne se lit `false`. */
  readonly principalSeesAmount: boolean;
  /** Le payeur copié à la passation, ou `null`. */
  readonly billedCompanyId: string | null;
  /** Centimes TTC. */
  readonly totalCents: number;
  readonly placedAt: Date;
  /** Le jour demandé, `YYYY-MM-DD`, ou `null`. */
  readonly requestedFor: string | null;
  /** Le client au nom de qui la commande est passée. */
  readonly placedByUserId: string;
  /**
   * Le règlement est décidé dès la passation (au compte) ; sinon (carte) l'avis
   * de passation attend `order.paid` (Hugo, 2026-10-20).
   */
  readonly settledAtPlacement: boolean;
  /** Saisie par l'équipe au nom du client (`placedByStaffId` non nul). */
  readonly enteredByTeam: boolean;
}

/**
 * **Le résumé d'une commande, pour l'avis au principal** — déclaré et
 * implémenté par `orders/`, lu par `sub-account-notices/` (même forme que
 * les ports d'`account/` en N1). Port étroit (ISP) : l'avis n'a besoin que
 * de cette question.
 */
export abstract class OrderNoticeSummaryReader {
  /** `null` si la commande n'existe pas. */
  abstract summaryOf(orderId: string): Promise<OrderNoticeSummary | null>;
}
