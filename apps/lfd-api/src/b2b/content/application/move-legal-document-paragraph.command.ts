import type { LegalDocumentKey } from "@lfd/contracts";

/** Command : déplacer un article au rang demandé, à partir de zéro. */
export class MoveLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalDocumentKey,
    readonly paragraphId: string,
    readonly position: number,
    /**
     * La révision que l'écran a lue : l'écriture lui est conditionnée (B2).
     * `undefined` = pas de contrôle, le temps que le back-office l'envoie.
     */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
