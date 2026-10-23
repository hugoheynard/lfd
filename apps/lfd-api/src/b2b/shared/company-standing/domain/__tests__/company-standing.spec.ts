import { billingReadingRole, type CompanyStanding, standingRole } from "../company-standing.js";
import type { StandingRole } from "../standing-role.js";

/** Une place : propre et/ou héritée d'un principal, au rôle donné. */
function standing(own: StandingRole | null, viaRole: StandingRole | null): CompanyStanding {
  return {
    companyStatus: "active",
    own,
    ownAccepted: own !== null,
    via: viaRole === null ? null : { companyId: "co_principal", name: "Hip", role: viaRole },
  };
}

describe("standingRole — le rôle effectif des gestes (S6, R2)", () => {
  it("aucune place : aucun rôle", () => {
    expect(standingRole(null)).toBeNull();
  });

  it("le propre seul parle tel quel", () => {
    expect(standingRole(standing("orders", null))).toBe("orders");
    expect(standingRole(standing("owner", null))).toBe("owner");
  });

  it("🔴 le détenteur du principal est admin du site, jamais détenteur", () => {
    expect(standingRole(standing(null, "owner"))).toBe("admin");
  });

  it("l'admin du principal est admin du site", () => {
    expect(standingRole(standing(null, "admin"))).toBe("admin");
  });

  it("le MAX : un propre plus large l'emporte, un plus étroit ne rétrograde pas", () => {
    expect(standingRole(standing("owner", "admin"))).toBe("owner");
    expect(standingRole(standing("billing", "owner"))).toBe("admin");
  });
});

describe("billingReadingRole — lire factures, impayés, compte bancaire (Q1)", () => {
  it("aucune place : rien", () => {
    expect(billingReadingRole(null)).toBeNull();
  });

  it("🔴 le détenteur du principal lit comme la facturation", () => {
    expect(billingReadingRole(standing(null, "owner"))).toBe("billing");
    expect(billingReadingRole(standing("orders", "owner"))).toBe("billing");
    expect(billingReadingRole(standing("admin", "owner"))).toBe("billing");
  });

  it("le détenteur du site reste détenteur", () => {
    expect(billingReadingRole(standing("owner", "owner"))).toBe("owner");
  });

  it("🔴 un admin hérité ne lit rien de plus que sa membership propre", () => {
    expect(billingReadingRole(standing(null, "admin"))).toBeNull();
    expect(billingReadingRole(standing("orders", "admin"))).toBe("orders");
    expect(billingReadingRole(standing("billing", "admin"))).toBe("billing");
  });

  it("sans héritage, la membership propre parle seule", () => {
    expect(billingReadingRole(standing("admin", null))).toBe("admin");
  });
});
