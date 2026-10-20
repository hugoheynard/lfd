import type { AcceptedMember } from "../../account/domain/ports/accepted-members.reader.js";
import type { CompanyStatus } from "../../account/domain/value-objects/company-status.js";

/**
 * **Écrit-on encore à ce principal ?** (`plan-notifications-sous-comptes.md`,
 * Q2) — lu à l'envoi : `suspended` est prévenu, `terminated` ne l'est plus.
 * Un principal disparu (`null`) ne l'est pas non plus.
 */
export function principalStillWritten(status: CompanyStatus | null): boolean {
  return status !== null && status !== "terminated";
}

/**
 * Les destinataires d'un avis : les membres acceptés aux rôles cochés, une
 * fois par personne, MOINS l'auteur du geste (§2 : on ne prévient pas
 * quelqu'un de ce qu'il vient de faire, même s'il est membre des deux).
 */
export function noticeRecipients(
  members: readonly AcceptedMember[],
  authorUserId: string | null,
): AcceptedMember[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (member.userId === authorUserId || seen.has(member.userId)) {
      return false;
    }
    seen.add(member.userId);
    return true;
  });
}

/**
 * « Paiement échoué **à la charge du principal** » (§1) : le principal n'est
 * prévenu d'un règlement mort que s'il en était le payeur copié.
 */
export function chargedToPrincipal(
  billedCompanyId: string | null,
  principalCompanyId: string,
): boolean {
  return billedCompanyId === principalCompanyId;
}
