import { catalogRightTransferViewSchema } from "../catalog-right-transfer.js";
import { ROLE_GRANTS, staffRoleSchema, staffResourceSchema } from "../staff-access.js";

/**
 * Le lot L1 de `plan-droit-lfc-catalog.md` : la graine donne `lfc_catalog`
 * là où elle donne `b2b_catalog`, au même niveau — sans quoi une base vierge
 * (e2e, dev) perdrait le catalogue à la bascule des gardes (L2).
 */
describe("la graine du catalogue publié", () => {
  it("donne lfc_catalog à chaque rôle qui tient b2b_catalog, au même niveau", () => {
    for (const role of staffRoleSchema.options) {
      expect(ROLE_GRANTS[role].lfc_catalog).toBe(ROLE_GRANTS[role].b2b_catalog);
    }
  });

  it("garde b2b_catalog dans le catalogue des ressources jusqu'à L2", () => {
    expect(staffResourceSchema.options).toContain("b2b_catalog");
    expect(staffResourceSchema.options).toContain("lfc_catalog");
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
