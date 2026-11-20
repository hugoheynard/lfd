import type { CompanyStanding } from "../company-standing.js";
import type { StandingRole } from "../standing-role.js";
import { canSetMenuOf } from "../sub-account-menu-writing.js";

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
