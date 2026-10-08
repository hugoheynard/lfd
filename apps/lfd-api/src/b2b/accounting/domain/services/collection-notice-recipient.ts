import type { NoticeRecipient } from "../entities/collection-notice.js";

/** Ce que la société payeuse offre comme adresses, telles que la base les tient. */
export interface PayerNoticeContacts {
  /** Les contacts au rôle `billing`, du plus ancien au plus récent. */
  readonly billingContactEmails: readonly string[];
  /** L'adresse du détenteur du compte (`owner`), `null` s'il n'y en a pas. */
  readonly ownerEmail: string | null;
}

/**
 * **À qui part l'avis de prélèvement** (décision Hugo, 2026-10-08) : le contact
 * de facturation de la société payeuse ; à défaut, le détenteur du compte.
 * Ni l'un ni l'autre : `null` — l'avis est « non envoyable », et le lot ne
 * se dépose pas tant que ce n'est pas réglé. Jamais une adresse devinée.
 *
 * Plusieurs contacts de facturation : le plus ancien, pour que la même
 * société reçoive ses avis au même endroit d'un mois sur l'autre.
 */
export function noticeRecipientOf(
  contacts: PayerNoticeContacts | undefined,
): NoticeRecipient | null {
  if (contacts === undefined) {
    return null;
  }
  const billing = contacts.billingContactEmails.map((email) => email.trim()).find(isAddress);
  if (billing !== undefined) {
    return { email: billing, source: "billing_contact" };
  }
  const owner = contacts.ownerEmail?.trim() ?? "";
  return isAddress(owner) ? { email: owner, source: "owner" } : null;
}

/** Une adresse vide ou sans arobase n'est pas joignable — rien de plus fin ici. */
function isAddress(email: string): boolean {
  return email.length > 0 && email.includes("@");
}
