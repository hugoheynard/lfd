import { isCompanyClosed } from "../company-closure.js";

describe("isCompanyClosed — supprimée ou résiliée", () => {
  it.each(["pending", "active", "suspended"] as const)("%s, non supprimée : ouverte", (status) => {
    expect(isCompanyClosed({ status, archivedAt: null })).toBe(false);
  });

  it("résiliée : fermée", () => {
    expect(isCompanyClosed({ status: "terminated", archivedAt: null })).toBe(true);
  });

  it.each(["pending", "active", "suspended", "terminated"] as const)(
    "supprimée, %s : fermée quel que soit le statut",
    (status) => {
      expect(isCompanyClosed({ status, archivedAt: new Date(0) })).toBe(true);
    },
  );
});
