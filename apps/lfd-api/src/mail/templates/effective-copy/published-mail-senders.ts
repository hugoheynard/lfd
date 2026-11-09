import type { MailNature, MailSenderIdentity, MailSpace } from "@lfd/mail-blocks";

/**
 * L'identité d'envoi rangée d'un espace, telle que l'envoi la lit (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) : servable, ou illisible — les
 * e-mails de l'espace partent alors sous l'identité par défaut, l'échec dit
 * dans le journal de l'API.
 */
export type PublishedMailSenderEntry =
  | { readonly kind: "servable"; readonly identity: MailSenderIdentity }
  | { readonly kind: "unreadable" };

/** Les identités d'envoi d'une nature, par espace. Un espace absent n'en a pas de rangée. */
export type PublishedMailSenders = Readonly<Partial<Record<MailSpace, PublishedMailSenderEntry>>>;

/**
 * Les identités d'envoi par nature, puis par espace (plan
 * `la-desinscription-et-l-accord.md`, règle 9, lot U5).
 */
export type PublishedMailSendersByNature = Readonly<Record<MailNature, PublishedMailSenders>>;

/** Aucune identité rangée : tout part sous l'identité par défaut. */
export const NO_PUBLISHED_MAIL_SENDERS: PublishedMailSendersByNature = {
  transactional: {},
  marketing: {},
};

/**
 * **L'identité sous laquelle part un e-mail de cette nature et de cet
 * espace** (lot U5). 🔴 Le repli : tant qu'aucune identité `marketing` n'est
 * rangée pour l'espace, un e-mail marketing prend son identité
 * `transactional` — le sous-domaine marketing est un geste DNS qui n'est pas
 * encore fait. Une identité marketing rangée mais illisible ne se replie PAS
 * en silence sur la transactionnelle : elle est rendue telle quelle, et
 * l'envoi le dit avant de partir sous l'identité par défaut, comme pour
 * toute identité illisible. `undefined` : rien de rangé, l'identité par
 * défaut de la configuration.
 */
export function senderEntryFor(
  senders: PublishedMailSendersByNature,
  space: MailSpace,
  nature: MailNature,
): PublishedMailSenderEntry | undefined {
  return senders[nature][space] ?? senders.transactional[space];
}
