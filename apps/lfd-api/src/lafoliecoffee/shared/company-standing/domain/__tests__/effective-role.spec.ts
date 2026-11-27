import { effectiveRole } from "../effective-role.js";

/** La règle du §3 de sous-comptes, lue par la requête partagée depuis S6. */
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

  it("orders et billing du principal jouent leur rôle sur le site", () => {
    expect(effectiveRole(null, "orders")).toBe("orders");
    expect(effectiveRole(null, "billing")).toBe("billing");
  });

  it("à rang égal, la membership propre au site l'emporte sur l'héritée", () => {
    expect(effectiveRole("billing", "orders")).toBe("billing");
    expect(effectiveRole("orders", "billing")).toBe("orders");
  });

  it("un rôle propre plus large n'est pas rétrogradé par l'héritage", () => {
    expect(effectiveRole("admin", "orders")).toBe("admin");
    expect(effectiveRole("owner", "billing")).toBe("owner");
  });

  it("sans membership ni principal, aucun rôle", () => {
    expect(effectiveRole(null, null)).toBeNull();
  });
});
