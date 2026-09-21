import { composeFeatureAccessBoard } from "../feature-access-board.js";
import type {
  StoredExemptionRow,
  StoredOverrideRow,
} from "../ports/feature-access-board.reader.js";

const AUTHOR = { staffUserId: "staff_1", name: "Camille Admin", role: "admin" };
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
        exemptible: true,
        override: null,
        exemptions: [],
      }),
      expect.objectContaining({
        key: "orders",
        levels: ["hidden", "visible"],
        effectiveLevel: "visible",
      }),
      expect.objectContaining({
        key: "invoices",
        levels: ["hidden", "visible"],
        effectiveLevel: "visible",
      }),
      expect.objectContaining({
        key: "desktopMenu",
        levels: ["hidden", "visible"],
        effectiveLevel: "visible",
      }),
      // 🔴 FERMÉE PAR DÉFAUT (2026-09-21) : ouvrir la livraison à qui n'a pas de
      // compte est une décision commerciale, et un défaut ouvert l'aurait prise
      // à la place de celui qui déploie.
      expect.objectContaining({
        key: "publicDelivery",
        levels: ["closed", "open"],
        defaultLevel: "closed",
        effectiveLevel: "closed",
        exemptible: true,
      }),
      // 2026-09-14 : l'écran ne propose pas d'exemption sur cette clé.
      expect.objectContaining({
        key: "customerMandate",
        levels: ["closed", "open"],
        defaultLevel: "closed",
        effectiveLevel: "closed",
        exemptible: false,
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
      override: { value: "browse", updatedAt: AT.toISOString() },
      exemptions: [{ email: "testeur@exemple.fr", accountState: "none" }],
    });
    // Un nom et un rôle, sans identifiant : le `sub` n'est plus servi (plan de
    // l'auteur, étape 5A).
    expect(board.features[0]?.override?.updatedBy).toEqual({
      name: "Camille Admin",
      role: "admin",
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
