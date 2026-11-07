import type { MailSenderIdentity, MailSpace } from "@lfd/mail-blocks";

/**
 * L'identité d'envoi rangée d'un espace, telle que l'envoi la lit (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) : servable, ou illisible — les
 * e-mails de l'espace partent alors sous l'identité par défaut, l'échec dit
 * dans le journal de l'API.
 */
export type PublishedMailSenderEntry =
  | { readonly kind: "servable"; readonly identity: MailSenderIdentity }
  | { readonly kind: "unreadable" };

/** Les identités d'envoi, par espace. Un espace absent part sous l'identité par défaut. */
export type PublishedMailSenders = Readonly<Partial<Record<MailSpace, PublishedMailSenderEntry>>>;
