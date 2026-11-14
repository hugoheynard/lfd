import { InvalidOpeningAuthorError } from "../../errors/account-errors.js";
import { CompanyOpening } from "../company-opening.js";

describe("CompanyOpening — qui a ouvert, qui suit", () => {
  it("une inscription du client n'a ni auteur ni suiveur", () => {
    const opening = CompanyOpening.none();
    expect(opening.author).toBeNull();
    expect(opening.followerStaffId).toBeNull();
  });

  it("un prospect ouvert par l'équipe est suivi par son auteur", () => {
    const opening = CompanyOpening.openedBy({ staffUserId: "staff_lou", name: "Lou Martin" });
    expect(opening.author).toEqual({ staffUserId: "staff_lou", name: "Lou Martin" });
    expect(opening.followerStaffId).toBe("staff_lou");
  });

  it("un site garde son auteur mais n'a pas de suiveur", () => {
    const opening = CompanyOpening.siteOpenedBy({ staffUserId: "staff_lou", name: "Lou Martin" });
    expect(opening.author?.staffUserId).toBe("staff_lou");
    expect(opening.followerStaffId).toBeNull();
  });

  it("un nom blanc est un nom inconnu, jamais une chaîne vide rangée", () => {
    expect(
      CompanyOpening.openedBy({ staffUserId: "staff_lou", name: "   " }).author?.name,
    ).toBeNull();
    expect(CompanyOpening.openedBy({ staffUserId: " staff_lou ", name: " Lou " }).author).toEqual({
      staffUserId: "staff_lou",
      name: "Lou",
    });
  });

  it("refuse un auteur sans identifiant, pour un prospect comme pour un site", () => {
    expect(() => CompanyOpening.openedBy({ staffUserId: "  ", name: "Lou" })).toThrow(
      InvalidOpeningAuthorError,
    );
    expect(() => CompanyOpening.siteOpenedBy({ staffUserId: "", name: null })).toThrow(
      InvalidOpeningAuthorError,
    );
  });

  it("relit les colonnes telles que rangées, auteur absent compris", () => {
    expect(
      CompanyOpening.reconstitute({
        declaredByStaffId: "staff_lou",
        declaredByName: null,
        followedByStaffId: "staff_ana",
      }),
    ).toEqual(
      CompanyOpening.reconstitute({
        declaredByStaffId: "staff_lou",
        declaredByName: null,
        followedByStaffId: "staff_ana",
      }),
    );
    const unknown = CompanyOpening.reconstitute({
      declaredByStaffId: null,
      declaredByName: null,
      followedByStaffId: null,
    });
    expect(unknown.author).toBeNull();
    expect(unknown.followerStaffId).toBeNull();
  });
});
