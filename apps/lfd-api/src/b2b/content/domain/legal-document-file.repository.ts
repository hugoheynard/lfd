import type { SalesTermsDocument } from "@lfd/contracts";

import type { LegalDocumentFile } from "./entities/legal-document-file.js";

/**
 * Port d'**écriture** des PDF de référence des CGV (plan
 * `legal/plan-cgv-par-audience.md`, C3).
 *
 * Pas de `delete`, pas d'écriture de colonne : un dépôt se lit en agrégat
 * (`current`) et s'enregistre avec celui qu'il remplace (`deposit`).
 */
export abstract class LegalDocumentFileRepository {
  /** Le PDF en vigueur pour ce texte, ou `null` s'il n'y en a jamais eu. */
  abstract current(document: SalesTermsDocument): Promise<LegalDocumentFile | null>;

  /**
   * Enregistre le dépôt neuf et la pose de `supersededAt` sur celui qu'il
   * remplace, **ensemble** — une seule transaction.
   *
   * @throws {LegalDocumentFileAlreadySupersededError} un autre dépôt a
   *   remplacé `replaced` entre-temps, ou en a posé un en vigueur.
   */
  abstract deposit(
    file: LegalDocumentFile,
    replaced: LegalDocumentFile | null,
    documentTitle: string,
  ): Promise<void>;
}
