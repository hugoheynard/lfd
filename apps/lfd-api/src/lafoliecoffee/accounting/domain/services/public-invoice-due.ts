import { addDays, isPublicLegalForm, publicPaymentDeadlineDays, toLegalForm } from "@lfd/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * **L'échéance d'une facture d'organisme public** (plan
 * `plan-clients-publics-chorus.md`, § 6 quinquies, T1′ et T3′).
 *
 * Le délai légal (30 jours, 50 pour un établissement public de santé) court
 * à compter de la RÉCEPTION de la facture sur Chorus Pro, donc du dépôt. À
 * l'émission, `due_on` vaut la date de facture plus ce délai — l'échéance au
 * plus tôt, si la facture était déposée le jour même — et fige le délai
 * (`due_on − issued_on`) : la condition imprimée et le calcul ne peuvent pas
 * diverger. Ce qui compte pour le règlement est `effectiveDueOn`.
 *
 * La nature se lit sur la forme juridique de l'acheteur FIGÉE dans la
 * facture, jamais sur `dueOn === null` (qui désigne l'avoir).
 */

/** Ce qu'il faut d'une pièce pour juger son échéance. Jours `AAAA-MM-JJ`. */
export interface DueInvoiceFacts {
  readonly isCreditNote: boolean;
  /** La forme juridique de l'acheteur figée dans la facture. */
  readonly buyerLegalForm: string;
  readonly issuedOn: string;
  readonly dueOn: string | null;
}

/** Le journal de dépôt d'une facture, réduit à ses dates. `null` partout : rien de saisi. */
export interface ChorusDepositStanding {
  readonly depositedOn: string | null;
  readonly rejectedOn: string | null;
  readonly rejectionReason: string | null;
  readonly acceptedOn: string | null;
}

/** Aucune ligne de dépôt. */
export const NOT_DEPOSITED: ChorusDepositStanding = {
  depositedOn: null,
  rejectedOn: null,
  rejectionReason: null,
  acceptedOn: null,
};

/** Cette forme juridique est-elle celle d'un acheteur public ? Une forme inconnue ne l'est pas. */
export function isPublicBuyerForm(legalForm: string): boolean {
  const form = toLegalForm(legalForm);
  return form !== null && isPublicLegalForm(form);
}

/** Une facture (380, jamais un avoir) adressée à un organisme public. */
export function isPublicInvoice(
  facts: Pick<DueInvoiceFacts, "isCreditNote" | "buyerLegalForm">,
): boolean {
  return !facts.isCreditNote && isPublicBuyerForm(facts.buyerLegalForm);
}

/**
 * L'échéance posée à l'émission d'une facture publique : date de facture +
 * délai légal de la forme, en jours **calendaires** ; `null` hors public.
 */
export function publicInvoiceDueOn(issuedOn: string, buyerLegalForm: string): string | null {
  const form = toLegalForm(buyerLegalForm);
  const days = form === null ? null : publicPaymentDeadlineDays(form);
  return days === null ? null : addDays(issuedOn, days);
}

/** Le délai figé d'une facture publique (`due_on − issued_on`), en jours ; `null` hors public. */
export function publicDeadlineDaysOf(facts: DueInvoiceFacts): number | null {
  if (!isPublicInvoice(facts) || facts.dueOn === null) {
    return null;
  }
  return Math.round((Date.parse(facts.dueOn) - Date.parse(facts.issuedOn)) / DAY_MS);
}

/**
 * **L'échéance qui compte** pour le règlement et les retards :
 *
 * - une pièce privée, ou un avoir : `due_on` tel quel ;
 * - une facture publique non déposée : aucune — elle n'est jamais en retard ;
 * - déposée : jour du dépôt + délai figé ;
 * - rejetée par Chorus : aucune — elle sort des impayés attendus
 *   (`awaitsPayment`), la comptabilité la remplace à la main.
 */
export function effectiveDueOn(
  facts: DueInvoiceFacts,
  standing: ChorusDepositStanding | null,
): string | null {
  const days = publicDeadlineDaysOf(facts);
  if (days === null) {
    return facts.dueOn;
  }
  const deposit = standing ?? NOT_DEPOSITED;
  if (deposit.depositedOn === null || deposit.rejectedOn !== null) {
    return null;
  }
  return addDays(deposit.depositedOn, days);
}

/** Une facture publique rejetée par Chorus n'attend plus de paiement ; toute autre, si. */
export function awaitsPayment(
  facts: DueInvoiceFacts,
  standing: ChorusDepositStanding | null,
): boolean {
  return !(isPublicInvoice(facts) && standing !== null && standing.rejectedOn !== null);
}

/** La condition de paiement imprimée (BT-20, PDF, avis) d'une facture publique. */
export function publicPaymentConditionText(deadlineDays: number): string {
  return `Paiement à ${String(deadlineDays)} jours à compter de la réception de la facture sur Chorus Pro.`;
}
