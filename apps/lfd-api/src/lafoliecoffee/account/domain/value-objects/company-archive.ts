import { InvalidArchiveReasonError } from "../errors/archive-errors.js";

/** Borne haute du motif : une phrase qu'on relit, pas un dossier. */
export const ARCHIVE_REASON_MAX_LENGTH = 500;

/**
 * **La suppression d'un compte** (un archivage) : quand, par qui, pourquoi.
 *
 * L'instant et le motif vont ensemble, et c'est la forme du type qui le tient :
 * « non supprimé » s'écrit `null` sur la société, pas une suppression aux
 * champs vides. La base tient la même règle par le `CHECK`
 * `companies_archive_complete`. L'auteur, lui, est facultatif, comme la trace
 * d'une activation : l'annuaire peut ne pas connaître son nom.
 */
export class CompanyArchive {
  private constructor(
    readonly archivedAt: Date,
    readonly byStaffId: string | null,
    readonly byName: string | null,
    readonly reason: string,
  ) {}

  /**
   * Une suppression **posée maintenant**. Le motif est obligatoire : c'est lui
   * qu'on relit avant de rendre le compte.
   *
   * @throws {InvalidArchiveReasonError} motif vide ou trop long.
   */
  static record(input: {
    readonly at: Date;
    readonly byStaffId: string | null;
    readonly byName: string | null;
    readonly reason: string;
  }): CompanyArchive {
    const trimmed = input.reason.trim();
    if (trimmed === "") {
      throw new InvalidArchiveReasonError("obligatoire — dites pourquoi ce compte est supprimé.");
    }
    if (trimmed.length > ARCHIVE_REASON_MAX_LENGTH) {
      throw new InvalidArchiveReasonError(`au plus ${ARCHIVE_REASON_MAX_LENGTH} caractères.`);
    }
    const name = input.byName?.trim() ?? "";
    return new CompanyArchive(input.at, input.byStaffId, name === "" ? null : name, trimmed);
  }

  /** Relit une suppression persistée — validée à la pose, on ne la refuse pas. */
  static reconstitute(
    archivedAt: Date,
    byStaffId: string | null,
    byName: string | null,
    reason: string,
  ): CompanyArchive {
    return new CompanyArchive(archivedAt, byStaffId, byName, reason);
  }
}
