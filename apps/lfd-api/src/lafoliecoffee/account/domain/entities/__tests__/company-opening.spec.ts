import {
  InvalidOpeningAuthorError,
  SelfDeclaredWithAuthorError,
} from "../../errors/account-errors.js";
import type { CompanyDeclarationChannel } from "../../value-objects/company-declaration-channel.js";
import { CompanyOpening } from "../../value-objects/company-opening.js";
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

describe("Company — l'auteur et le suiveur entrent à la naissance", () => {
  it("une ouverture par l'équipe porte son auteur, qui la suit", () => {
    const company = Company.declare(identity, null, "staff", CompanyOpening.openedBy(LOU));
    expect(company.opening.author).toEqual(LOU);
    expect(company.toPersistence().followedByStaffId).toBe("staff_lou");
  });

  it("une inscription du client n'a ni auteur ni suiveur", () => {
    const company = Company.declare(identity, null, "self");
    expect(company.opening.author).toBeNull();
    expect(company.toPersistence().followedByStaffId).toBeNull();
  });

  it("refuse une ouverture par l'équipe sans auteur", () => {
    expect(() => Company.declare(identity, null, "staff", CompanyOpening.none())).toThrow(
      InvalidOpeningAuthorError,
    );
  });

  it("refuse une inscription du client qui porterait un auteur", () => {
    // La signature l'interdit déjà ; la règle tient aussi à l'exécution.
    const declare = Company.declare.bind(Company) as (
      identity: CompanyIdentityInput,
      contact: null,
      via: CompanyDeclarationChannel,
      opening: CompanyOpening,
    ) => Company;
    expect(() => declare(identity, null, "self", CompanyOpening.openedBy(LOU))).toThrow(
      SelfDeclaredWithAuthorError,
    );
  });

  it("relit l'ouverture rangée, et sans elle n'invente ni auteur ni suiveur", () => {
    const opening = CompanyOpening.reconstitute({
      declaredByStaffId: "staff_lou",
      declaredByName: "Lou Martin",
      followedByStaffId: "staff_ana",
    });
    const base = { ...Company.declare(identity, null, "self").toPersistence(), contact: null };

    const reloaded = Company.reconstitute({ ...base, id: "cmp_1", opening });
    expect(reloaded.opening.author).toEqual(LOU);
    expect(reloaded.toPersistence().followedByStaffId).toBe("staff_ana");

    const bare = Company.reconstitute({ ...base, id: "cmp_2" });
    expect(bare.opening.author).toBeNull();
    expect(bare.toPersistence().followedByStaffId).toBeNull();
  });
});
