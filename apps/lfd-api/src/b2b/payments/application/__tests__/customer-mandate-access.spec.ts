import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../../domain/errors/bank-account-errors.js";
import { CustomerMandateClosedError } from "../../domain/errors/mandate-errors.js";
import type { BankAccountRole } from "../../domain/ports/bank-account-guard.reader.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { FixedGate, FixedGuard, Steps } from "./payment-doubles.js";

function access(role: BankAccountRole | null, open: boolean) {
  const steps = new Steps();
  const deps = { guard: new FixedGuard(steps, role), gate: new FixedGate(steps, open) };
  return { steps, run: () => ensureCustomerMandateAccess(deps, "usr_1", "cmp_1") };
}

describe("ensureCustomerMandateAccess — le seuil des routes client du mandat", () => {
  it.each<BankAccountRole>(["owner", "billing"])(
    "laisse passer %s quand le drapeau est ouvert",
    async (role) => {
      const { steps, run } = access(role, true);

      await expect(run()).resolves.toBeUndefined();
      expect(steps.log).toEqual(["guard", "gate"]);
    },
  );

  it.each<BankAccountRole>(["admin", "orders"])(
    "refuse %s en 403, sans lire le drapeau",
    async (role) => {
      const { steps, run } = access(role, true);

      await expect(run()).rejects.toBeInstanceOf(BankAccountRoleRequiredError);
      expect(steps.log).toEqual(["guard"]);
    },
  );

  it("refuse un non-membre en 404, sans lire le drapeau", async () => {
    const { steps, run } = access(null, true);

    await expect(run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    expect(steps.log).toEqual(["guard"]);
  });

  /**
   * 🔴 L'ordre du plan (fin du §9) : 404 → 403 → 409 drapeau. Un non-membre ne
   * doit pas apprendre « fermé » sur une société qui n'est pas la sienne — ce
   * serait lui dire qu'elle existe.
   */
  it("oppose le mur AVANT le drapeau fermé : non-membre 404, rôle 403, membre 409", async () => {
    await expect(access(null, false).run()).rejects.toBeInstanceOf(BankAccountCompanyNotFoundError);
    await expect(access("orders", false).run()).rejects.toBeInstanceOf(
      BankAccountRoleRequiredError,
    );
    await expect(access("owner", false).run()).rejects.toBeInstanceOf(CustomerMandateClosedError);
  });
});
