import { staffSettlementRefusal, type StaffSettlementPorts } from "../staff-settlement-refusal.js";
import { shelfOrder } from "./shelf-circuit-fixtures.js";

/** Chaque lecture compte ses appels : le refus d'`offered` n'en fait aucune. */
function countingPorts(): { readonly ports: StaffSettlementPorts; readonly reads: () => number } {
  let reads = 0;
  const read = <T>(value: T) => {
    reads += 1;
    return Promise.resolve(value);
  };
  return {
    reads: () => reads,
    ports: {
      guard: {
        companyStatusOf: () => read("pending" as const),
        settlesOnAccount: () => read("none" as const),
        isPublicPayer: () => read(false),
      },
      shelf: { refusesWithoutCredit: () => read(true) },
    },
  };
}

/**
 * La commande offerte (plan `plan-commande-offerte.md`, O3) : rien à
 * encaisser, donc ni crédit, ni statut, ni payeur à juger. Le droit d'offrir
 * se garde au handler.
 */
describe("staffSettlementRefusal — offered", () => {
  it("🔴 laisse passer offered sans rien lire, même sans crédit ni société active", async () => {
    const { ports, reads } = countingPorts();

    const refusal = await staffSettlementRefusal(ports, shelfOrder(1), "offered", "co_1", false);

    expect(refusal).toBeNull();
    expect(reads()).toBe(0);
  });

  it("laisse passer offered au comptoir aussi", async () => {
    const { ports } = countingPorts();

    expect(await staffSettlementRefusal(ports, shelfOrder(1), "offered", "co_1", true)).toBeNull();
  });
});
