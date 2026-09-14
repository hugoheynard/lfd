import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../errors/bank-account-errors.js";
import { ensureBankAccountAccess } from "../bank-account-access.js";

describe("ensureBankAccountAccess", () => {
  it("laisse passer le détenteur", () => {
    expect(() => ensureBankAccountAccess("owner", "cmp_1")).not.toThrow();
  });

  it("laisse passer le rôle facturation", () => {
    expect(() => ensureBankAccountAccess("billing", "cmp_1")).not.toThrow();
  });

  it("refuse l'administrateur de l'espace (403) — il gère l'espace, pas le compte prélevé", () => {
    expect(() => ensureBankAccountAccess("admin", "cmp_1")).toThrow(BankAccountRoleRequiredError);
  });

  it("refuse le rôle commandes (403)", () => {
    expect(() => ensureBankAccountAccess("orders", "cmp_1")).toThrow(BankAccountRoleRequiredError);
  });

  it("cache la société à un non-membre (404, pas 403)", () => {
    // On ne divulgue ni l'existence de la société ni celle de son RIB.
    expect(() => ensureBankAccountAccess(null, "cmp_1")).toThrow(BankAccountCompanyNotFoundError);
  });

  it("nomme le geste de sortie dans le refus d'un membre", () => {
    expect(() => ensureBankAccountAccess("orders", "cmp_1")).toThrow(/détenteur/u);
  });
});
