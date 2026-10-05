import { effectiveRole } from "../effective-role.js";

/** La règle du §3 de plan-sous-comptes — écrite, éprouvée, pas encore branchée (S6). */
describe("effectiveRole — le rôle effectif dans une société", () => {
  it("prend le plus large de la membership propre et du rôle hérité", () => {
    // Un owner du principal qui a aussi `orders` dans le sous-compte y reste admin.
    expect(effectiveRole("orders", "owner")).toBe("admin");
    expect(effectiveRole("billing", "admin")).toBe("admin");
    expect(effectiveRole("owner", "admin")).toBe("owner");
    expect(effectiveRole("orders", "orders")).toBe("orders");
    expect(effectiveRole("owner", null)).toBe("owner");
  });

  it("un owner du principal est admin du sous-compte, jamais owner", () => {
    expect(effectiveRole(null, "owner")).toBe("admin");
  });

  it("un admin du principal est admin du sous-compte", () => {
    expect(effectiveRole(null, "admin")).toBe("admin");
  });

  it("orders et billing du principal n'ouvrent rien sur un sous-compte", () => {
    expect(effectiveRole(null, "orders")).toBeNull();
    expect(effectiveRole(null, "billing")).toBeNull();
  });

  it("sans membership ni principal, aucun rôle", () => {
    expect(effectiveRole(null, null)).toBeNull();
  });
});
