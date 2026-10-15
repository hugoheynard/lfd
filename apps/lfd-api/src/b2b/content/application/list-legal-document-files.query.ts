import type { SalesTermsDocument } from "@lfd/contracts";

/** Query : l'historique des PDF de référence d'un texte de CGV, le plus récent d'abord. */
export class ListLegalDocumentFilesQuery {
  constructor(readonly document: SalesTermsDocument) {}
}
