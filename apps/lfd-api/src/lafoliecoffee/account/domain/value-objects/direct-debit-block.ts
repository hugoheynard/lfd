import { InvalidDirectDebitBlockReasonError } from "../errors/direct-debit-errors.js";

/** Borne haute de la raison : une phrase qu'on relit, pas un dossier. */
export const DIRECT_DEBIT_BLOCK_REASON_MAX_LENGTH = 500;

/**
 * **Le blocage du prélèvement** d'une société : quand, par qui, pourquoi.
 *
 * Les trois vont ensemble, et c'est la forme du type qui le tient : il n'existe
 * pas de blocage sans raison ni auteur, et « non bloqué » s'écrit `null` sur la
 * société — pas un blocage aux champs vides. La base tient la même règle par
 * une contrainte `CHECK` (`companies_direct_debit_block_complete`).
 *
 * `blockedBy` est l'id de la **fiche** staff, comme les autres traces : ce qui
 * survit à un changement de nom ou de périmètre.
 */
export class DirectDebitBlock {
  private constructor(
    readonly blockedAt: Date,
    readonly blockedBy: string,
    readonly reason: string,
  ) {}

  /**
   * Un blocage **posé maintenant**. La raison est obligatoire : elle est lue par
   * le personnel suivant, qui n'a que ça pour savoir s'il peut débloquer.
   *
   * @throws {InvalidDirectDebitBlockReasonError} raison vide ou trop longue.
   */
  static impose(reason: string, blockedAt: Date, blockedBy: string): DirectDebitBlock {
    const trimmed = reason.trim();
    if (trimmed === "") {
      throw new InvalidDirectDebitBlockReasonError(
        "obligatoire — dites pourquoi, pour l'agent suivant.",
      );
    }
    if (trimmed.length > DIRECT_DEBIT_BLOCK_REASON_MAX_LENGTH) {
      throw new InvalidDirectDebitBlockReasonError(
        `au plus ${DIRECT_DEBIT_BLOCK_REASON_MAX_LENGTH} caractères.`,
      );
    }
    return new DirectDebitBlock(blockedAt, blockedBy, trimmed);
  }

  /** Relit un blocage persisté — il a été validé à la pose, on ne le refuse pas. */
  static reconstitute(blockedAt: Date, blockedBy: string, reason: string): DirectDebitBlock {
    return new DirectDebitBlock(blockedAt, blockedBy, reason);
  }
}
