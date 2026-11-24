import { OccurrenceAlreadyServedError } from "../../domain/errors/occurrence-already-served.error.js";
import { occurrenceDuplicateOf } from "../occurrence-duplicate.js";

const PROVENANCE = {
  subscriptionId: "basket_1",
  occurrenceDay: "2026-11-16",
  deltas: { added: [], removed: [] },
};

/** Une violation d'unicité telle que Prisma la rend pour une contrainte posée en SQL. */
function uniqueViolation(constraint: string): object {
  return {
    code: "P2002",
    meta: {
      target: ["from_subscription_id", "from_occurrence_day"],
      driverAdapterError: {
        cause: {
          originalMessage: `duplicate key value violates unique constraint "${constraint}"`,
        },
      },
    },
  };
}

describe("occurrenceDuplicateOf — une échéance, au plus une commande", () => {
  it("reconnaît l'index des échéances par son NOM", () => {
    expect(
      occurrenceDuplicateOf(uniqueViolation("orders_one_per_occurrence"), PROVENANCE),
    ).toBeInstanceOf(OccurrenceAlreadyServedError);
  });

  it("ne prend pas un doublon de numéro de commande pour un rejeu", () => {
    expect(
      occurrenceDuplicateOf(uniqueViolation("orders_order_number_key"), PROVENANCE),
    ).toBeNull();
  });

  it("ne dit rien d'une commande qui n'est pas une échéance", () => {
    expect(
      occurrenceDuplicateOf(uniqueViolation("orders_one_per_occurrence"), undefined),
    ).toBeNull();
  });

  it("laisse passer toute autre erreur", () => {
    expect(occurrenceDuplicateOf(new TypeError("réseau"), PROVENANCE)).toBeNull();
  });
});
