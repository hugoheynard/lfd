import type { LegalEntity } from "../domain/entities/legal-entity.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { LegalEntityRepository } from "../domain/ports/legal-entity.repository.js";

/**
 * Charge l'entité, ou refuse en 404.
 *
 * Six handlers commencent par ces trois lignes. Les recopier n'est pas cher ;
 * ce qui l'est, c'est qu'un septième les recopie **presque** — un `?? null` qui
 * devient un `undefined`, une erreur générique au lieu de celle qui nomme
 * l'identifiant. Le refus a une seule forme parce qu'il est écrit une seule
 * fois.
 */
export async function loadOrFail(
  repository: LegalEntityRepository,
  legalEntityId: string,
): Promise<LegalEntity> {
  const entity = await repository.load(legalEntityId);
  if (entity === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }
  return entity;
}
