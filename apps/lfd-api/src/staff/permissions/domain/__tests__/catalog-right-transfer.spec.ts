import { assessCatalogRightTransfer } from "../catalog-right-transfer.js";
import type { CatalogRightOverride, CatalogRightRole } from "../catalog-right-transfer.reader.js";

const role = (overrides: Partial<CatalogRightRole> = {}): CatalogRightRole => ({
  key: "commercial",
  label: "Commercial",
  archived: false,
  grants: {},
  ...overrides,
});

const override = (overrides: Partial<CatalogRightOverride> = {}): CatalogRightOverride => ({
  staffUserId: "fiche-lea",
  staffName: "Léa Martin",
  resource: "b2b_catalog",
  action: "write",
  effect: "allow",
  ...overrides,
});

describe("l'aperçu du transfert du droit du catalogue — les rôles", () => {
  it("ne liste pas un rôle qui ne porte aucun des deux droits", () => {
    const view = assessCatalogRightTransfer([role({ grants: { b2b_orders: "write" } })], [], 0);
    expect(view.roles).toEqual([]);
    expect(view.clear).toBe(true);
  });

  it("dit l'accès PERDU d'un rôle qui ne tient que b2b_catalog", () => {
    const view = assessCatalogRightTransfer([role({ grants: { b2b_catalog: "write" } })], [], 0);
    expect(view.roles).toEqual([
      {
        key: "commercial",
        label: "Commercial",
        archived: false,
        legacyLevel: "write",
        catalogLevel: null,
        gap: "catalog_missing",
      },
    ]);
    expect(view.clear).toBe(false);
  });

  it("dit l'écart de niveau", () => {
    const view = assessCatalogRightTransfer(
      [role({ grants: { b2b_catalog: "write", lfc_catalog: "read" } })],
      [],
      0,
    );
    expect(view.roles[0]?.gap).toBe("level_mismatch");
  });

  it("n'est pas sans écart tant que b2b_catalog est encore porté, même recopié", () => {
    const view = assessCatalogRightTransfer(
      [role({ grants: { b2b_catalog: "read", lfc_catalog: "read" } })],
      [],
      0,
    );
    expect(view.roles[0]?.gap).toBe("legacy_still_held");
    expect(view.clear).toBe(false);
  });

  it("est sans écart quand le rôle ne tient plus que lfc_catalog", () => {
    const view = assessCatalogRightTransfer([role({ grants: { lfc_catalog: "write" } })], [], 0);
    expect(view.roles[0]?.gap).toBe("none");
    expect(view.clear).toBe(true);
  });

  it("compte un rôle ARCHIVÉ : remis en service, il rendrait ce qu'il portait", () => {
    const view = assessCatalogRightTransfer(
      [role({ archived: true, grants: { b2b_catalog: "read" } })],
      [],
      0,
    );
    expect(view.roles[0]).toMatchObject({ archived: true, gap: "catalog_missing" });
    expect(view.clear).toBe(false);
  });

  it("n'affirme rien d'un rôle illisible, et surtout pas « sans écart »", () => {
    const view = assessCatalogRightTransfer([role({ grants: null })], [], 0);
    expect(view.roles[0]?.gap).toBe("unreadable_grants");
    expect(view.clear).toBe(false);
  });

  it("trie les rôles par clé", () => {
    const view = assessCatalogRightTransfer(
      [
        role({ key: "zeta", grants: { lfc_catalog: "read" } }),
        role({ key: "alpha", grants: { lfc_catalog: "read" } }),
      ],
      [],
      0,
    );
    expect(view.roles.map((line) => line.key)).toEqual(["alpha", "zeta"]);
  });
});

describe("l'aperçu du transfert du droit du catalogue — les dérogations", () => {
  it("dit un ajout non recopié comme un accès perdu", () => {
    const view = assessCatalogRightTransfer([], [override()], 0);
    expect(view.overrides).toEqual([
      {
        staffUserId: "fiche-lea",
        staffName: "Léa Martin",
        action: "write",
        legacyEffect: "allow",
        catalogEffect: null,
        gap: "catalog_missing",
      },
    ]);
  });

  it("nomme le retrait non recopié : la personne GAGNERAIT l'accès", () => {
    const view = assessCatalogRightTransfer([], [override({ effect: "deny" })], 0);
    expect(view.overrides[0]?.gap).toBe("revoke_not_copied");
    expect(view.clear).toBe(false);
  });

  it("dit l'écart d'effet", () => {
    const view = assessCatalogRightTransfer(
      [],
      [override({ effect: "deny" }), override({ resource: "lfc_catalog", effect: "allow" })],
      0,
    );
    expect(view.overrides[0]?.gap).toBe("effect_mismatch");
  });

  it("garde l'écart tant que la dérogation sur b2b_catalog reste, même recopiée", () => {
    const view = assessCatalogRightTransfer(
      [],
      [override({ effect: "deny" }), override({ resource: "lfc_catalog", effect: "deny" })],
      0,
    );
    expect(view.overrides[0]?.gap).toBe("legacy_still_held");
    expect(view.clear).toBe(false);
  });

  it("recopie read et write séparément : une ligne par action", () => {
    const view = assessCatalogRightTransfer(
      [],
      [
        override({ action: "write", effect: "deny" }),
        override({ action: "read", resource: "lfc_catalog", effect: "deny" }),
      ],
      0,
    );
    expect(view.overrides.map((line) => [line.action, line.gap])).toEqual([
      ["read", "none"],
      ["write", "revoke_not_copied"],
    ]);
  });
});

describe("l'aperçu du transfert du droit du catalogue — la condition de L2", () => {
  it("rend le compte des notifications sans qu'il empêche « sans écart » (§5, Q3)", () => {
    const view = assessCatalogRightTransfer([role({ grants: { lfc_catalog: "read" } })], [], 4);
    expect(view.unreadLegacyNotifications).toBe(4);
    expect(view.clear).toBe(true);
  });

  it("n'est pas sans écart si une seule dérogation porte encore b2b_catalog", () => {
    const view = assessCatalogRightTransfer(
      [role({ grants: { lfc_catalog: "write" } })],
      [override({ resource: "lfc_catalog" }), override({ staffUserId: "fiche-marc" })],
      0,
    );
    expect(view.clear).toBe(false);
  });
});
