import type { SalesTermsDocument } from "@lfd/contracts";

import type { LegalDocumentFile } from "./entities/legal-document-file.js";

/**
 * Port de **lecture** des PDF de référence des CGV — l'historique de l'écran
 * et le téléchargement. Distinct du port d'écriture (ISP) : télécharger
 * n'autorise pas à déposer.
 */
export abstract class LegalDocumentFileReader {
  /** Tous les dépôts du texte, le plus récent d'abord. */
  abstract history(document: SalesTermsDocument): Promise<readonly LegalDocumentFile[]>;

  /** Le PDF en vigueur, ou `null`. */
  abstract current(document: SalesTermsDocument): Promise<LegalDocumentFile | null>;

  /** Un dépôt de ce texte par son id, ou `null` (id inconnu, ou d'un autre texte). */
  abstract byId(document: SalesTermsDocument, fileId: string): Promise<LegalDocumentFile | null>;
}
