import {
  InvoiceCompanyNotFoundError,
  InvoiceRoleRequiredError,
} from "../../errors/invoice-access-errors.js";
import { ensureInvoiceAccess } from "../invoice-access.js";

describe("le mur de « Mes factures »", () => {
  it("laisse passer le détenteur et le rôle facturation", () => {
    expect(() => ensureInvoiceAccess("owner", "c1")).not.toThrow();
    expect(() => ensureInvoiceAccess("billing", "c1")).not.toThrow();
  });

  it("un non-membre : 404 qui ne dit rien de la société", () => {
    expect(() => ensureInvoiceAccess(null, "c1")).toThrow(InvoiceCompanyNotFoundError);
  });

  it("un membre d'un autre rôle : 403 qui nomme le geste de sortie", () => {
    for (const role of ["admin", "orders"] as const) {
      expect(() => ensureInvoiceAccess(role, "c1")).toThrow(InvoiceRoleRequiredError);
    }
    expect(() => ensureInvoiceAccess("orders", "c1")).toThrow(/détenteur/u);
  });
});
