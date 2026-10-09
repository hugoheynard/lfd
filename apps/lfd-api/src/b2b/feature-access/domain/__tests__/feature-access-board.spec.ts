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
    // Deux clés depuis le 2026-10-09 ; aucune ne propose d'exemption.
    expect(board.features).toEqual([
      expect.objectContaining({
        key: "customerMandate",
        label: "Mandat SEPA client",
        levels: ["closed", "open"],
        defaultLevel: "closed",
        effectiveLevel: "closed",
        exemptible: false,
        override: null,
        exemptions: [],
      }),
      expect.objectContaining({
        key: "facebookLogin",
        label: "Connexion par Facebook",
        levels: ["hidden", "visible"],
        defaultLevel: "hidden",
        effectiveLevel: "hidden",
        exemptible: false,
        override: null,
        exemptions: [],
      }),
    ]);
  });

  it("montre la dérogation, son auteur et sa date, et la valeur effective qui en découle", () => {
    const board = composeFeatureAccessBoard({
      overrides: [override("customerMandate", "open")],
      exemptions: [],
    });

    expect(board.features[0]).toMatchObject({
      effectiveLevel: "open",
      override: { value: "open", updatedAt: AT.toISOString() },
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
      effectiveLevel: "closed",
      override: null,
      exemptions: [],
    });
    expect(board.ignored).toEqual([
      { table: "override", key: "legacy_flag", detail: "on", reason: "unknown_key" },
      { table: "exemption", key: "legacy_flag", detail: "vieux@exemple.fr", reason: "unknown_key" },
    ]);
  });

  /**
   * Les cinq clés retirées le 2026-10-09 : leurs lignes de production ne sont
   * pas effacées, elles sont signalées et n'ouvrent ni ne ferment rien.
   */
  it("signale les lignes des clés retirées le 2026-10-09 en clé inconnue", () => {
    const removed = ["shop", "orders", "invoices", "desktopMenu", "publicDelivery"];
    const board = composeFeatureAccessBoard({
      overrides: removed.map((key) => override(key, "closed")),
      exemptions: [exemption("shop", "testeur@exemple.fr")],
    });

    expect(board.features.map((feature) => feature.key)).toEqual([
      "customerMandate",
      "facebookLogin",
    ]);
    expect(board.features[0]).toMatchObject({ effectiveLevel: "closed", override: null });
    expect(board.ignored).toEqual([
      ...removed.map((key) => ({
        table: "override",
        key,
        detail: "closed",
        reason: "unknown_key",
      })),
      { table: "exemption", key: "shop", detail: "testeur@exemple.fr", reason: "unknown_key" },
    ]);
  });

  it("signale une dérogation dont la valeur n'est plus un niveau, et retombe sur le défaut", () => {
    const board = composeFeatureAccessBoard({
      overrides: [override("customerMandate", "maintenance")],
      exemptions: [],
    });

    expect(board.features[0]).toMatchObject({ effectiveLevel: "closed", override: null });
    expect(board.ignored).toEqual([
      { table: "override", key: "customerMandate", detail: "maintenance", reason: "unknown_level" },
    ]);
  });
});
