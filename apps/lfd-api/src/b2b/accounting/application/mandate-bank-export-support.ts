import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { ExportEntity } from "../domain/events/mandate-bank-export.events.js";
import type { LegalEntityReader, LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";

/** L'entité de la route, ou un 404 qui la nomme. @throws {LegalEntityNotFoundError} */
export async function exportEntityOrFail(
  entities: LegalEntityReader,
  legalEntityId: string,
): Promise<LegalEntityRecord> {
  const entity = await entities.byId(legalEntityId);
  if (entity === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }
  return entity;
}

/** L'entité telle que le journal la cite. */
export function journalEntity(entity: LegalEntityRecord): ExportEntity {
  return { id: entity.id, name: entity.name };
}
