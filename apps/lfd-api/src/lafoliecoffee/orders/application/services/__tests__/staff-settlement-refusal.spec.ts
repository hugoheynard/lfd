import { OfferedOrderUnavailableError } from "../../../domain/errors/order-errors.js";
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
 * La commande offerte (plan `plan-commande-offerte.md`, O0) : le contrat
 * l'admet, la ligne « offert » n'existe pas encore. Sans ce refus, `offered`
 * tombait dans le chemin du lien et créait un règlement par carte pour une
 * commande promise gratuite.
 */
describe("staffSettlementRefusal — offered", () => {
  it("🔴 refuse offered tant que la passation ne le sait pas, sans rien lire", async () => {
    const { ports, reads } = countingPorts();

    const refusal = await staffSettlementRefusal(ports, shelfOrder(1), "offered", "co_1", false);

    expect(refusal).toBeInstanceOf(OfferedOrderUnavailableError);
    expect(reads()).toBe(0);
  });

  it("refuse offered au comptoir aussi", async () => {
    const { ports } = countingPorts();

    const refusal = await staffSettlementRefusal(ports, shelfOrder(1), "offered", "co_1", true);

    expect(refusal).toBeInstanceOf(OfferedOrderUnavailableError);
  });
});
