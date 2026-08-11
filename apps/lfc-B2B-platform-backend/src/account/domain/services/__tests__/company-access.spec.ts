import { CompanyAdminRequiredError, CompanyNotFoundError } from "../../errors/account-errors.js";
import { ensureCompanyAdmin } from "../company-access.js";

describe("ensureCompanyAdmin", () => {
  it("laisse passer un gestionnaire", () => {
    expect(() => ensureCompanyAdmin("owner", "company_1")).not.toThrow();
  });

  it("cache l'entreprise à un non-membre (404, pas 403)", () => {
    // On ne divulgue pas l'existence de l'entreprise à qui n'en est pas membre :
    // c'est un ResourceNotFound, pas une erreur d'autorisation.
    expect(() => ensureCompanyAdmin(null, "company_1")).toThrow(CompanyNotFoundError);
  });

  it("refuse un simple membre (403)", () => {
    // Membre mais pas gestionnaire : il sait que l'entreprise existe (il en est),
    // donc un refus explicite plutôt qu'un 404.
    expect(() => ensureCompanyAdmin("member", "company_1")).toThrow(CompanyAdminRequiredError);
  });
});
