import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  FixedDebtors,
  FixedGuard,
  InMemoryMandates,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { GetMyCompanyBilledToHandler } from "../get-my-company-billed-to.handler.js";
import { GetMyCompanyBilledToQuery } from "../get-my-company-billed-to.query.js";

function read(role: BankAccountRole | null, billedTo: { companyId: string; name: string } | null) {
  const steps = new Steps();
  const debtors = new FixedDebtors(new InMemoryMandates(steps));
  debtors.billedTo = billedTo;
  return new GetMyCompanyBilledToHandler(
    new FixedGuard(steps, role),
    debtors,
    new FixedClock(new Date("2026-09-15T09:00:00.000Z")),
  ).execute(new GetMyCompanyBilledToQuery("usr_1", "cmp_1"));
}

describe("GetMyCompanyBilledToHandler — « Facturé à » (plan-sous-comptes §3)", () => {
  it("nomme le principal d'un site, et rien d'autre — ni son identifiant", async () => {
    await expect(read("owner", { companyId: "alpes", name: "Alpes Chalets" })).resolves.toEqual({
      billedTo: { name: "Alpes Chalets" },
    });
  });

  it("rend `null` pour une société qui paie seule", async () => {
    await expect(read("billing", null)).resolves.toEqual({ billedTo: null });
  });

  it("garde le mur du RIB : non-membre 404, autre rôle 403", async () => {
    await expect(read(null, null)).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    await expect(read("orders", null)).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
  });
});
