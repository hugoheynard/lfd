import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../../domain/errors/bank-account-errors.js";
import { CustomerMandateClosedError } from "../../../domain/errors/mandate-errors.js";
import { MandateOptions } from "../../../domain/value-objects/mandate-options.js";
import type { BankAccountRole } from "../../../domain/ports/bank-account-guard.reader.js";
import {
  bankAccount,
  FixedGate,
  FixedGuard,
  InMemoryBankAccounts,
  Steps,
} from "../../__tests__/payment-doubles.js";
import { GetMyCompanyMandateOptionsHandler } from "../get-my-company-mandate-options.handler.js";
import { GetMyCompanyMandateOptionsQuery } from "../get-my-company-mandate-options.query.js";

function harness(role: BankAccountRole | null = "owner", open = true) {
  const steps = new Steps();
  const accounts = new InMemoryBankAccounts(steps);
  const handler = new GetMyCompanyMandateOptionsHandler(
    new FixedGuard(steps, role),
    new FixedGate(steps, open),
    accounts,
  );
  return {
    steps,
    accounts,
    run: () => handler.execute(new GetMyCompanyMandateOptionsQuery("usr_1", "cmp_1")),
  };
}

describe("GetMyCompanyMandateOptionsHandler — les zones 14 et 19 lues par le client", () => {
  it("rend null tant qu'aucun RIB n'est déposé", async () => {
    await expect(harness().run()).resolves.toBeNull();
  });

  it("rend les deux zones, et rien du compte", async () => {
    const h = harness("billing");
    const account = bankAccount();
    account.setOptions(MandateOptions.create({ debtorReference: "C-1", contractNumber: "CT-7" }));
    h.accounts.stored = account;

    await expect(h.run()).resolves.toEqual({ debtorReference: "C-1", contractNumber: "CT-7" });
  });

  it.each<BankAccountRole>(["admin", "orders"])("refuse %s en 403", async (role) => {
    await expect(harness(role).run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
  });

  it("refuse un non-membre en 404, avant de lire le drapeau", async () => {
    const h = harness(null, false);

    await expect(h.run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(h.steps.log).toEqual(["guard"]);
  });

  it("refuse en 409 quand le drapeau est fermé, sans lire le RIB", async () => {
    const h = harness("owner", false);

    await expect(h.run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
    expect(h.accounts.reads).toBe(0);
  });
});
