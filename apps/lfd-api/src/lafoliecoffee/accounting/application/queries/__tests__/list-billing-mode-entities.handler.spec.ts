import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { ListBillingModeEntitiesHandler } from "../list-billing-mode-entities.handler.js";

function record(id: string, name: string, archivedAt: string | null = null): LegalEntityRecord {
  return { ...toView(declaredEntity(), true), id, name, archivedAt };
}

class ListedEntities extends LegalEntityReader {
  constructor(private readonly records: readonly LegalEntityRecord[]) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve(this.records);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(this.records.find((entity) => entity.id === id) ?? null);
  }
}

describe("ListBillingModeEntitiesHandler — les entités du choix, à l'ouverture d'un compte", () => {
  it("rend les entités en service dans l'ordre de la liste, sans les archivées, nom seulement", async () => {
    const view = await new ListBillingModeEntitiesHandler(
      new ListedEntities([
        record("le1", "La Folie Douce"),
        record("le0", "Ancienne", paris("2026-01-01").toISOString()),
        record("le2", "La Folie Coffee"),
      ]),
    ).execute();

    expect(view).toEqual([
      { id: "le1", name: "La Folie Douce" },
      { id: "le2", name: "La Folie Coffee" },
    ]);
  });

  it("aucune entité en service : une liste vide", async () => {
    await expect(
      new ListBillingModeEntitiesHandler(new ListedEntities([])).execute(),
    ).resolves.toEqual([]);
  });
});
