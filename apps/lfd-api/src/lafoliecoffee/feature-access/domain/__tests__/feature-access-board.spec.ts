import { composeFeatureAccessBoard } from "../feature-access-board.js";
import type {
  StoredCompanyExemptionRow,
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

function companyExemption(key: string, companyId: string, name: string): StoredCompanyExemptionRow {
  return { key, companyId, companyName: name, createdAt: AT, createdBy: AUTHOR };
}

/** Rien en base, sauf ce que le test pose. */
function stored(
  rows: Partial<Parameters<typeof composeFeatureAccessBoard>[0]>,
): Parameters<typeof composeFeatureAccessBoard>[0] {
  return { overrides: [], exemptions: [], companyExemptions: [], ...rows };
}

describe("composeFeatureAccessBoard — l'écran admin", () => {
  it("montre le défaut du code quand rien n'est posé", () => {
    const board = composeFeatureAccessBoard(stored({}));

    expect(board.ignored).toEqual([]);
    // Quatre clés ; seul le planificateur s'exempte, et société par société.
    expect(board.features).toEqual([
      expect.objectContaining({
        key: "customerMandate",
        label: "Mandat SEPA client",
        levels: ["closed", "open"],
        defaultLevel: "closed",
        effectiveLevel: "closed",
        exemptBy: null,
        override: null,
        exemptions: [],
      }),
      expect.objectContaining({
        key: "facebookLogin",
        label: "Connexion par Facebook",
        levels: ["hidden", "visible"],
        defaultLevel: "hidden",
        effectiveLevel: "hidden",
        exemptBy: null,
        override: null,
        exemptions: [],
      }),
      expect.objectContaining({
        key: "proSignupCallback",
        label: "Rappel depuis l'inscription pro",
        levels: ["hidden", "visible"],
        defaultLevel: "hidden",
        effectiveLevel: "hidden",
        exemptBy: null,
        override: null,
        exemptions: [],
      }),
      expect.objectContaining({
        key: "orderPlanner",
        label: "Planificateur de commandes",
        levels: ["closed", "open"],
        defaultLevel: "closed",
        effectiveLevel: "closed",
        exemptBy: "company",
        override: null,
        exemptions: [],
        companyExemptions: [],
      }),
    ]);
  });

  it("montre la dérogation, son auteur et sa date, et la valeur effective qui en découle", () => {
    const board = composeFeatureAccessBoard(
      stored({
        overrides: [override("customerMandate", "open")],
        exemptions: [],
      }),
    );

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
    const board = composeFeatureAccessBoard(
      stored({
        overrides: [override("legacy_flag", "on")],
        exemptions: [exemption("legacy_flag", "vieux@exemple.fr")],
      }),
    );

    expect(board.features[0]).toMatchObject({
      effectiveLevel: "closed",
      override: null,
      exemptions: [],
    });
    expect(board.ignored).toEqual([
      { table: "override", key: "legacy_flag", id: null, detail: "on", reason: "unknown_key" },
      {
        table: "exemption",
        key: "legacy_flag",
        id: "ex_vieux@exemple.fr",
        detail: "vieux@exemple.fr",
        reason: "unknown_key",
      },
    ]);
  });

  /**
   * Les cinq clés retirées le 2026-10-09 : leurs lignes de production ne sont
   * pas effacées, elles sont signalées et n'ouvrent ni ne ferment rien.
   */
  it("signale les lignes des clés retirées le 2026-10-09 en clé inconnue", () => {
    const removed = ["shop", "orders", "invoices", "desktopMenu", "publicDelivery"];
    const board = composeFeatureAccessBoard(
      stored({
        overrides: removed.map((key) => override(key, "closed")),
        exemptions: [exemption("shop", "testeur@exemple.fr")],
      }),
    );

    expect(board.features.map((feature) => feature.key)).toEqual([
      "customerMandate",
      "facebookLogin",
      "proSignupCallback",
      "orderPlanner",
    ]);
    expect(board.features[0]).toMatchObject({ effectiveLevel: "closed", override: null });
    expect(board.ignored).toEqual([
      ...removed.map((key) => ({
        table: "override",
        key,
        id: null,
        detail: "closed",
        reason: "unknown_key",
      })),
      {
        table: "exemption",
        key: "shop",
        id: "ex_testeur@exemple.fr",
        detail: "testeur@exemple.fr",
        reason: "unknown_key",
      },
    ]);
  });

  it("signale une dérogation dont la valeur n'est plus un niveau, et retombe sur le défaut", () => {
    const board = composeFeatureAccessBoard(
      stored({
        overrides: [override("customerMandate", "maintenance")],
        exemptions: [],
      }),
    );

    expect(board.features[0]).toMatchObject({ effectiveLevel: "closed", override: null });
    expect(board.ignored).toEqual([
      {
        table: "override",
        key: "customerMandate",
        id: null,
        detail: "maintenance",
        reason: "unknown_level",
      },
    ]);
  });

  it("liste les sociétés exemptées du planificateur, nom figé, auteur et date", () => {
    const board = composeFeatureAccessBoard(
      stored({ companyExemptions: [companyExemption("orderPlanner", "co_1", "Chalet Alpin")] }),
    );

    expect(board.features[3]?.companyExemptions).toEqual([
      {
        companyId: "co_1",
        companyName: "Chalet Alpin",
        createdAt: AT.toISOString(),
        createdBy: { name: "Camille Admin", role: "admin" },
      },
    ]);
    expect(board.ignored).toEqual([]);
  });

  /**
   * Le planificateur s'exemptait par adresse avant de s'exempter par société
   * (plan exemption par société, § 5) : ses lignes par adresse ne jouent plus,
   * l'écran les signale pour qu'on les retire.
   */
  it("signale une exemption par adresse sur une clé qui s'exempte par société, sans la lister", () => {
    const board = composeFeatureAccessBoard(
      stored({ exemptions: [exemption("orderPlanner", "chef@chalet.test")] }),
    );

    expect(board.features[3]?.exemptions).toEqual([]);
    expect(board.ignored).toEqual([
      {
        table: "exemption",
        key: "orderPlanner",
        id: "ex_chef@chalet.test",
        detail: "chef@chalet.test",
        reason: "exemption_kind_retired",
      },
    ]);
  });

  it("signale une exemption par société sur une clé qui ne s'exempte pas par société", () => {
    const board = composeFeatureAccessBoard(
      stored({
        companyExemptions: [
          companyExemption("customerMandate", "co_1", "Chalet Alpin"),
          companyExemption("legacy_flag", "co_2", "Bistrot"),
        ],
      }),
    );

    expect(board.features[0]?.companyExemptions).toEqual([]);
    expect(board.ignored).toEqual([
      {
        table: "company_exemption",
        key: "customerMandate",
        id: "co_1",
        detail: "Chalet Alpin",
        reason: "exemption_kind_retired",
      },
      {
        table: "company_exemption",
        key: "legacy_flag",
        id: "co_2",
        detail: "Bistrot",
        reason: "unknown_key",
      },
    ]);
  });
});
