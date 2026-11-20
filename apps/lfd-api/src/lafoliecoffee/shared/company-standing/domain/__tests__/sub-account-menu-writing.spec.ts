import type { CompanyStanding } from "../company-standing.js";
import type { StandingRole } from "../standing-role.js";
import { canReadSiteMenuOf, canSetMenuOf, canSetSitesMenuOf } from "../sub-account-menu-writing.js";

/** Une place : propre et/ou héritée d'un principal, au rôle donné. */
function standing(own: StandingRole | null, viaRole: StandingRole | null): CompanyStanding {
  return {
    companyStatus: "active",
    own,
    ownAccepted: own !== null,
    via: viaRole === null ? null : { companyId: "co_principal", name: "Club", role: viaRole },
  };
}

describe("canSetMenuOf — qui écrit la carte d'un sous-compte (§ 3.2)", () => {
  it("aucune place : refusé", () => {
    expect(canSetMenuOf(null)).toBe(false);
  });

  it("le propriétaire et l'admin du principal l'écrivent", () => {
    expect(canSetMenuOf(standing(null, "owner"))).toBe(true);
    expect(canSetMenuOf(standing(null, "admin"))).toBe(true);
  });

  it("🔴 le propriétaire PROPRE du sous-compte ne l'écrit pas — le rôle effectif n'est pas lu", () => {
    expect(canSetMenuOf(standing("owner", null))).toBe(false);
    expect(canSetMenuOf(standing("admin", null))).toBe(false);
  });

  it("un rôle propre ne change rien à l'héritage : seul `via` parle", () => {
    expect(canSetMenuOf(standing("orders", "admin"))).toBe(true);
    expect(canSetMenuOf(standing("owner", "admin"))).toBe(true);
  });

  it("un `orders` ou un `billing` du principal ne l'écrit pas", () => {
    expect(canSetMenuOf(standing(null, "orders"))).toBe(false);
    expect(canSetMenuOf(standing(null, "billing"))).toBe(false);
  });
});

describe("canReadSiteMenuOf — qui lit la carte d'un site (Hugo, 2026-11-20)", () => {
  it("celui qui l'écrit la lit", () => {
    expect(canReadSiteMenuOf(standing(null, "admin"))).toBe(true);
  });

  it("un membre accepté du site la lit, quel que soit son rôle", () => {
    expect(canReadSiteMenuOf(standing("orders", null))).toBe(true);
    expect(canReadSiteMenuOf(standing("owner", null))).toBe(true);
  });

  it("un invité du site qui n'est pas entré ne la lit pas", () => {
    expect(canReadSiteMenuOf({ ...standing("orders", null), ownAccepted: false })).toBe(false);
  });

  it("aucune place, ou un `orders` du principal : refusé", () => {
    expect(canReadSiteMenuOf(null)).toBe(false);
    expect(canReadSiteMenuOf(standing(null, "orders"))).toBe(false);
  });
});

describe("canSetSitesMenuOf — qui écrit la carte commune des sites (§ 6.4)", () => {
  it("le propriétaire et l'admin ACCEPTÉS du principal actif l'écrivent", () => {
    expect(canSetSitesMenuOf(standing("owner", null))).toBe(true);
    expect(canSetSitesMenuOf(standing("admin", null))).toBe(true);
  });

  it("un invité qui n'est pas entré est refusé", () => {
    expect(canSetSitesMenuOf({ ...standing("owner", null), ownAccepted: false })).toBe(false);
  });

  it("un principal suspendu est refusé", () => {
    expect(canSetSitesMenuOf({ ...standing("owner", null), companyStatus: "suspended" })).toBe(
      false,
    );
  });

  it("un membre `orders` ou `billing` est refusé", () => {
    expect(canSetSitesMenuOf(standing("orders", null))).toBe(false);
    expect(canSetSitesMenuOf(standing("billing", null))).toBe(false);
  });

  it("le rôle hérité n'ouvre pas la carte commune d'une autre société", () => {
    expect(canSetSitesMenuOf(standing(null, "owner"))).toBe(false);
  });

  it("aucune place : refusé", () => {
    expect(canSetSitesMenuOf(null)).toBe(false);
  });
});
