import type { SalesTermsDocument } from "@lfd/contracts";

/** Command : déposer un PDF de référence pour un texte de CGV (plan des CGV, C3). */
export class DepositLegalDocumentFileCommand {
  constructor(
    readonly document: SalesTermsDocument,
    /** Les octets reçus, tels quels : le domaine juge, pas le contrôleur. */
    readonly bytes: Buffer,
    readonly staffUserId: string,
  ) {}
}
