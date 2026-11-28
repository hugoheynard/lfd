import {
  CounterAccountBackorderRefusedError,
  CounterAccountDeliveryRefusedError,
} from "../../../domain/errors/counter-account-service.errors.js";
import type { OrderCompanyStatus } from "../../../domain/ports/company-status.reader.js";
import {
  ensureCounterAccountFulfillment,
  ensureNotCounterAccountBackorder,
} from "../counter-account-service-guard.js";

/** Un statut fixe, et le compte des lectures : un retrait ne doit rien lire. */
function statuses(status: OrderCompanyStatus) {
  const asked: string[] = [];
  return {
    asked,
    companyStatusOf: (companyId: string) => {
      asked.push(companyId);
      return Promise.resolve(status);
    },
  };
}

/** Ce que sert un compte ouvert au comptoir (`plan-comptes-du-comptoir.md`, § 3.7). */
describe("ensureCounterAccountFulfillment", () => {
  it("refuse la livraison à un compte ouvert au comptoir, et dit de convertir", async () => {
    const error = await ensureCounterAccountFulfillment(
      statuses("counter_opened"),
      "co_1",
      "delivery",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CounterAccountDeliveryRefusedError);
    expect(error instanceof Error ? error.message : "").toContain("convertissez le compte");
  });

  it("admet le retrait sans lire le statut", async () => {
    const reader = statuses("counter_opened");
    await expect(
      ensureCounterAccountFulfillment(reader, "co_1", "pickup"),
    ).resolves.toBeUndefined();
    expect(reader.asked).toEqual([]);
  });

  it("laisse livrer une société active", async () => {
    await expect(
      ensureCounterAccountFulfillment(statuses("active"), "co_1", "delivery"),
    ).resolves.toBeUndefined();
  });
});

describe("ensureNotCounterAccountBackorder", () => {
  it("refuse le reliquat d'un compte ouvert au comptoir", async () => {
    await expect(
      ensureNotCounterAccountBackorder(statuses("counter_opened"), "co_1"),
    ).rejects.toBeInstanceOf(CounterAccountBackorderRefusedError);
  });

  it("admet celui d'une société active, et d'un particulier sans rien lire", async () => {
    const reader = statuses("counter_opened");
    await expect(
      ensureNotCounterAccountBackorder(statuses("active"), "co_1"),
    ).resolves.toBeUndefined();
    await expect(ensureNotCounterAccountBackorder(reader, null)).resolves.toBeUndefined();
    expect(reader.asked).toEqual([]);
  });
});
