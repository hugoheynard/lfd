import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
  HolderRoleLockedError,
} from "../../errors/account-errors.js";
import { ensureCompanyAdmin, ensureHolderKeepsOwnership } from "../company-access.js";

describe("ensureHolderKeepsOwnership", () => {
  /**
   * Régression : un admin client rétrogradait le détenteur en notant son adresse
   * de connexion dans le carnet avec un autre rôle (corrigé le 2026-09-14).
   */
  it("REFUSE de donner un autre rôle au détenteur en place", () => {
    expect(() => ensureHolderKeepsOwnership("company_1", "billing", "user_1", "user_1")).toThrow(
      HolderRoleLockedError,
    );
  });

  it("laisse le détenteur se ré-ouvrir un accès détenteur", () => {
    expect(() =>
      ensureHolderKeepsOwnership("company_1", "owner", "user_1", "user_1"),
    ).not.toThrow();
  });

  it("laisse passer quiconque n'est pas le détenteur, avec n'importe quel rôle", () => {
    expect(() =>
      ensureHolderKeepsOwnership("company_1", "admin", "user_1", "user_2"),
    ).not.toThrow();
    expect(() => ensureHolderKeepsOwnership("company_1", "admin", null, "user_2")).not.toThrow();
  });

  it("dit le refus dans les termes du geste appelant", () => {
    expect(() =>
      ensureHolderKeepsOwnership("company_1", "orders", "user_1", "user_1", "Dit par le carnet."),
    ).toThrow("Dit par le carnet.");
  });
});

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
    expect(() => ensureCompanyAdmin("orders", "company_1")).toThrow(CompanyAdminRequiredError);
  });
});
