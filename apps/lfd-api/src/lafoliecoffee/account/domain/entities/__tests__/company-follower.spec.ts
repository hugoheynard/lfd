import { InvalidFollowerError, SiteHasNoFollowerError } from "../../errors/follower-errors.js";
import { CompanyOpening } from "../../value-objects/company-opening.js";
import { HierarchyPlace } from "../../value-objects/hierarchy-place.js";
import { Company, type CompanyIdentityInput } from "../company.js";

const identity: CompanyIdentityInput = {
  raisonSociale: "",
  enseigne: "Le Comptoir des Halles",
  formeJuridique: "",
  siret: "",
  siren: "",
  vatNumber: "",
};

const LOU = { staffUserId: "staff_lou", name: "Lou Martin" };

function stored(opening: CompanyOpening, parentCompanyId: string | null = null): Company {
  const base = { ...Company.declare(identity, null, "self").toPersistence(), contact: null };
  return Company.reconstitute({
    ...base,
    id: "cmp_1",
    opening,
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: false,
      groupWithoutDelivery: false,
    }),
  });
}

describe("Company.assignFollower — confier le suivi commercial", () => {
  it("confie une inscription du client, sans toucher à l'auteur absent", () => {
    const company = stored(CompanyOpening.none());

    expect(company.assignFollower("staff_ana")).toBe(true);
    expect(company.opening.followerStaffId).toBe("staff_ana");
    expect(company.opening.author).toBeNull();
    expect(company.toPersistence().followedByStaffId).toBe("staff_ana");
  });

  it("réattribue en gardant l'auteur de l'ouverture", () => {
    const company = stored(CompanyOpening.openedBy(LOU));

    expect(company.assignFollower("staff_ana")).toBe(true);
    expect(company.opening.author).toEqual(LOU);
    expect(company.opening.followerStaffId).toBe("staff_ana");
  });

  it("retire le suiveur", () => {
    const company = stored(CompanyOpening.openedBy(LOU));

    expect(company.assignFollower(null)).toBe(true);
    expect(company.toPersistence().followedByStaffId).toBeNull();
  });

  it("ne change rien quand le suiveur est déjà celui-là", () => {
    expect(stored(CompanyOpening.openedBy(LOU)).assignFollower("staff_lou")).toBe(false);
    expect(stored(CompanyOpening.none()).assignFollower(null)).toBe(false);
  });

  it("refuse un site : son suivi est celui du principal", () => {
    const site = stored(CompanyOpening.siteOpenedBy(LOU), "cmp_parent");

    expect(() => site.assignFollower("staff_ana")).toThrow(SiteHasNoFollowerError);
    expect(() => site.assignFollower(null)).toThrow(SiteHasNoFollowerError);
    expect(site.opening.followerStaffId).toBeNull();
  });

  it("refuse un identifiant blanc", () => {
    expect(() => stored(CompanyOpening.none()).assignFollower("  ")).toThrow(InvalidFollowerError);
  });
});
