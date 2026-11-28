import { AccountSettlementNotGrantedError } from "../../../domain/errors/order-errors.js";
import { CounterAccountSettlementNotGrantedError } from "../../../domain/errors/shelf-order-errors.js";
import type { OrderCompanyStatus } from "../../../domain/ports/company-status.reader.js";
import { accountStanding } from "../order-settlement.js";
import {
  counterCompanyStatusRefusal,
  staffSettlementRefusal,
  type StaffSettlementPorts,
} from "../staff-settlement-refusal.js";
import { shelfOrder } from "./shelf-circuit-fixtures.js";

/** Une société d'un statut donné, au crédit mensuel accordé (celui de l'ouverture). */
function ports(status: OrderCompanyStatus): StaffSettlementPorts {
  return {
    guard: {
      companyStatusOf: () => Promise.resolve(status),
      settlesOnAccount: () => Promise.resolve("granted" as const),
      isPublicPayer: () => Promise.resolve(false),
    },
    shelf: { refusesWithoutCredit: () => Promise.resolve(false) },
  };
}

/**
 * Un compte ouvert au comptoir règle au compte au comptoir seulement, pour
 * qui a `b2b_counter_accounts:write` (`plan-comptes-du-comptoir.md`, § 3.2).
 */
describe("staffSettlementRefusal — compte ouvert au comptoir", () => {
  it("admet le compte au comptoir pour qui en a le droit", async () => {
    expect(
      await staffSettlementRefusal(
        ports("counter_opened"),
        shelfOrder(1),
        "account",
        "co_1",
        true,
        true,
      ),
    ).toBeNull();
  });

  it("le refuse au comptoir sans le droit, comme une société inactive", async () => {
    const refusal = await staffSettlementRefusal(
      ports("counter_opened"),
      shelfOrder(1),
      "account",
      "co_1",
      true,
      false,
    );

    expect(refusal).toBeInstanceOf(CounterAccountSettlementNotGrantedError);
    expect(refusal).toMatchObject({ reason: "company_inactive" });
  });

  it("le refuse hors du comptoir, même avec le droit", async () => {
    expect(
      await staffSettlementRefusal(
        ports("counter_opened"),
        shelfOrder(1),
        "account",
        "co_1",
        false,
        true,
      ),
    ).toBeInstanceOf(AccountSettlementNotGrantedError);
  });

  it("le droit n'ouvre rien à une société en attente", async () => {
    expect(
      await staffSettlementRefusal(ports("pending"), shelfOrder(1), "account", "co_1", true, true),
    ).toMatchObject({ reason: "company_inactive" });
  });

  it("ne dit pas « inactif » au lien du comptoir : le lien garde son propre refus", async () => {
    expect(await counterCompanyStatusRefusal(ports("counter_opened").guard, "co_1")).toBeNull();
  });

  it("🔴 la boutique ne règle jamais au compte d'un compte du comptoir", async () => {
    expect(
      await accountStanding(ports("counter_opened").guard, { companyId: "co_1", payerId: "co_1" }),
    ).toBe("none");
  });
});
