import { catalogRightTransferViewSchema } from "../catalog-right-transfer.js";
import {
  ALL_STAFF_PERMISSIONS,
  GRANTABLE_STAFF_RESOURCES,
  ROLE_GRANTS,
  isRetiredStaffResource,
  resolvePermissionsFromGrants,
  staffResourceSchema,
  staffRoleSchema,
} from "../staff-access.js";
import { roleGrantsSchema } from "../staff-role.js";

/**
 * Le lot L2 de `plan-droit-lfc-catalog.md` : `b2b_catalog` est RETIRÉ —
 * lisible, jamais résolu, jamais semé.
 */
describe("le retrait de b2b_catalog", () => {
  it("le garde dans le schéma : un rôle qui le porte encore se lit sans erreur", () => {
    expect(staffResourceSchema.options).toContain("b2b_catalog");
    const parsed = roleGrantsSchema.safeParse([
      { resource: "b2b_catalog", action: "write" },
      { resource: "b2b_orders", action: "read" },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("le marque retiré, et seul lui", () => {
    expect(isRetiredStaffResource("b2b_catalog")).toBe(true);
    expect(isRetiredStaffResource("lfc_catalog")).toBe(false);
    expect(GRANTABLE_STAFF_RESOURCES).not.toContain("b2b_catalog");
    expect(ALL_STAFF_PERMISSIONS.some((entry) => entry.startsWith("b2b_catalog:"))).toBe(false);
  });

  it("garde à un rôle qui le porte tous ses AUTRES droits, sans ouvrir le catalogue", () => {
    const permissions = resolvePermissionsFromGrants({ b2b_catalog: "write", b2b_orders: "read" });
    expect(permissions).toEqual(["b2b_orders:read"]);
  });

  it("n'applique aucune dérogation qui le porte — ni pour accorder, ni pour refuser", () => {
    expect(
      resolvePermissionsFromGrants({ lfc_catalog: "write" }, [
        { resource: "b2b_catalog", action: "read", effect: "deny" },
        { resource: "b2b_catalog", action: "write", effect: "allow" },
      ]),
    ).toEqual(["lfc_catalog:read", "lfc_catalog:write"]);
  });

  it("ne le sème plus : la graine donne lfc_catalog à la place", () => {
    for (const role of staffRoleSchema.options) {
      expect(ROLE_GRANTS[role].b2b_catalog).toBeUndefined();
    }
    expect(ROLE_GRANTS.commercial.lfc_catalog).toBe("write");
    expect(ROLE_GRANTS.comptabilite.lfc_catalog).toBe("read");
  });
});

describe("le contrat de l'aperçu du transfert", () => {
  it("refuse un compte de notifications négatif", () => {
    const parsed = catalogRightTransferViewSchema.safeParse({
      roles: [],
      overrides: [],
      unreadLegacyNotifications: -1,
      clear: true,
    });
    expect(parsed.success).toBe(false);
  });
});
