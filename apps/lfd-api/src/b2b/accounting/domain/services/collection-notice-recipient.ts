import type { NoticeRecipient } from "../entities/collection-notice.js";

/**
 * Une adresse, et **qui** elle désigne : un identifiant stable, sans adresse
 * (`contact:<id>` pour un contact, `user:<id>` pour une personne). La clé
 * d'un e-mail porte cet identifiant, jamais l'adresse (revue du service
 * d'e-mails, cas 4).
 */
export interface NoticeAddress {
  readonly id: string;
  readonly email: string;
}

/** Ce que la société payeuse offre comme adresses, telles que la base les tient. */
export interface PayerNoticeContacts {
  /** Les contacts au rôle `billing`, du plus ancien au plus récent. */
  readonly billingContacts: readonly NoticeAddress[];
  /** Le détenteur du compte (`owner`), `null` s'il n'y en a pas. */
  readonly owner: NoticeAddress | null;
}

/** L'adresse retenue pour le payeur, avec qui elle désigne. */
export interface PayerNoticeRecipient extends NoticeRecipient {
  readonly id: string;
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
  const recipient = payerNoticeRecipientOf(contacts);
  return recipient === null ? null : { email: recipient.email, source: recipient.source };
}

/** La même règle, en gardant l'identifiant de qui est retenu (la facture le met dans sa clé). */
export function payerNoticeRecipientOf(
  contacts: PayerNoticeContacts | undefined,
): PayerNoticeRecipient | null {
  if (contacts === undefined) {
    return null;
  }
  const billing = contacts.billingContacts
    .map((contact) => ({ id: contact.id, email: contact.email.trim() }))
    .find((contact) => isAddress(contact.email));
  if (billing !== undefined) {
    return { ...billing, source: "billing_contact" };
  }
  const owner = contacts.owner;
  const email = owner?.email.trim() ?? "";
  return owner !== null && isAddress(email) ? { id: owner.id, email, source: "owner" } : null;
}

/** Une adresse vide ou sans arobase n'est pas joignable — rien de plus fin ici. */
function isAddress(email: string): boolean {
  return email.length > 0 && email.includes("@");
}
