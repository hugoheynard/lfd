import type { MailCharterSettings, MailSpace } from "@lfd/mail-blocks";

/**
 * La charte publiée d'un espace, telle que l'envoi la lit (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) : servable, ou illisible — les
 * e-mails de l'espace partent alors avec la charte de départ, l'échec dit
 * dans le journal de l'API.
 */
export type PublishedMailCharterEntry =
  | { readonly kind: "servable"; readonly settings: MailCharterSettings; readonly version: number }
  | { readonly kind: "unreadable"; readonly version: number };

/** Les chartes publiées, par espace. Un espace absent garde la charte de départ. */
export type PublishedMailCharters = Readonly<Partial<Record<MailSpace, PublishedMailCharterEntry>>>;
