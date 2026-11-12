import type { BillingModeEntityView } from "@lfd/contracts";

import type { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";

/**
 * Les entités émettrices **en service** que le choix du mode propose, dans
 * l'ordre de `LegalEntityReader.list()` : une entité archivée n'émet plus, on
 * n'y choisit plus rien. Seuls l'identifiant et le nom sortent — ce qui se lit
 * sous le droit sociétés n'expose rien de comptable.
 */
export async function livingBillingModeEntities(
  entities: LegalEntityReader,
): Promise<readonly BillingModeEntityView[]> {
  return (await entities.list())
    .filter((entity) => entity.archivedAt === null)
    .map((entity) => ({ id: entity.id, name: entity.name }));
}
