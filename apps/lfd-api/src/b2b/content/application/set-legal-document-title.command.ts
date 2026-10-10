import type { LegalDocumentHeading, LegalMention } from "@lfd/contracts";

/**
 * Command : renommer le document d'une mention, dans les trois langues d'un coup.
 *
 * Elle porte QUI écrit : le titre est ce que la boutique affiche sur le lien du
 * pied de page, et savoir qui l'a changé fait partie de ce qu'on doit pouvoir
 * répondre dans six mois.
 */
export class SetLegalDocumentTitleCommand {
  constructor(
    readonly mention: LegalMention,
    readonly heading: LegalDocumentHeading,
    /**
     * La révision que l'écran a lue : l'écriture lui est conditionnée (B2).
     * `undefined` = pas de contrôle, le temps que le back-office l'envoie.
     */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
