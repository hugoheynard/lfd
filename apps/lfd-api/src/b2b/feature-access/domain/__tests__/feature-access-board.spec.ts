import { composeFeatureAccessBoard } from "../feature-access-board.js";
import type {
  StoredExemptionRow,
  StoredOverrideRow,
} from "../ports/feature-access-board.reader.js";

const AUTHOR = { sub: "staff|1", name: "Camille Admin", role: "admin" };
const AT = new Date("2026-09-14T09:00:00.000Z");

function override(key: string, value: string): StoredOverrideRow {
  return { key, value, updatedAt: AT, updatedBy: AUTHOR };
}

function exemption(key: string, email: string): StoredExemptionRow {
  return { id: `ex_${email}`, key, email, createdAt: AT, createdBy: AUTHOR, accountState: "none" };
}

describe("composeFeatureAccessBoard — l'écran admin", () => {
  it("montre le défaut du code quand rien n'est posé", () => {
    const board = composeFeatureAccessBoard({ overrides: [], exemptions: [] });

    expect(board.ignored).toEqual([]);
    expect(board.features).toEqual([
      expect.objectContaining({
        key: "shop",
        label: "Boutique",
        levels: ["closed", "browse", "order"],
        defaultLevel: "order",
        effectiveLevel: "order",
        override: null,
        exemptions: [],
      }),
    ]);
  });

  it("montre la dérogation, son auteur et sa date, et la valeur effective qui en découle", () => {
    const board = composeFeatureAccessBoard({
      overrides: [override("shop", "browse")],
      exemptions: [exemption("shop", "testeur@exemple.fr")],
    });

    expect(board.features[0]).toMatchObject({
      effectiveLevel: "browse",
      override: { value: "browse", updatedAt: AT.toISOString(), updatedBy: AUTHOR },
      exemptions: [{ email: "testeur@exemple.fr", accountState: "none" }],
    });
  });

  it("signale une ligne dont la clé n'est plus au catalogue, sans l'interpréter", () => {
    const board = composeFeatureAccessBoard({
      overrides: [override("legacy_flag", "on")],
      exemptions: [exemption("legacy_flag", "vieux@exemple.fr")],
    });

    expect(board.features[0]).toMatchObject({
      effectiveLevel: "order",
      override: null,
      exemptions: [],
    });
    expect(board.ignored).toEqual([
      { table: "override", key: "legacy_flag", detail: "on", reason: "unknown_key" },
      { table: "exemption", key: "legacy_flag", detail: "vieux@exemple.fr", reason: "unknown_key" },
    ]);
  });

  it("signale une dérogation dont la valeur n'est plus un niveau, et retombe sur le défaut", () => {
    const board = composeFeatureAccessBoard({
      overrides: [override("shop", "maintenance")],
      exemptions: [],
    });

    expect(board.features[0]).toMatchObject({ effectiveLevel: "order", override: null });
    expect(board.ignored).toEqual([
      { table: "override", key: "shop", detail: "maintenance", reason: "unknown_level" },
    ]);
  });
});
