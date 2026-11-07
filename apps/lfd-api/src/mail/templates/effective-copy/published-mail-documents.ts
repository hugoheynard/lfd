import type { MailDocument } from "@lfd/mail-blocks";

/**
 * Le document publié d'un e-mail, tel que l'envoi le lit (plan
 * `plan-editeur-par-blocs.md`, § 5, S4c) : servable — il tient contre les
 * blocs que CE code déclare —, ou illisible, et l'e-mail part alors dans
 * l'ordre du code (§ 11), l'échec dit dans le journal de l'API.
 */
export type PublishedMailDocumentEntry =
  | { readonly kind: "servable"; readonly document: MailDocument; readonly version: number }
  | { readonly kind: "unreadable"; readonly version: number; readonly reason: string };

/** Les documents publiés, par clé du registre. Un e-mail absent n'en a pas. */
export type PublishedMailDocuments = Readonly<Record<string, PublishedMailDocumentEntry>>;
