import { CARD_INCREASE_PAYMENT_DELAY_MS } from "../../../domain/entities/card-increase-proposal.js";
import { adminCardIncreaseOf } from "../admin-order-card-increase.js";
import { proposalAt } from "./card-increase-doubles.js";

/** Le projet de la scène naît à l'instant 0 : son échéance n'est jamais comparée à l'horloge. */
const EXPIRES = new Date(CARD_INCREASE_PAYMENT_DELAY_MS).toISOString();

describe("adminCardIncreaseOf (plan S2, §2.8)", () => {
  it.each(["awaiting_payment", "ready", "stalled"] as const)(
    "un projet %s se montre avec son complément et son échéance",
    (state) => {
      expect(adminCardIncreaseOf(proposalAt(state))).toEqual({
        complementCents: 1_200,
        state,
        expiresAt: EXPIRES,
        refusal: null,
      });
    },
  );

  it.each(["applied", "refused", "abandoned", "closed"] as const)(
    "un projet %s, terminé, ne se montre pas",
    (state) => {
      expect(adminCardIncreaseOf(proposalAt(state))).toBeNull();
    },
  );

  it("pas de projet, rien à montrer", () => {
    expect(adminCardIncreaseOf(null)).toBeNull();
  });
});
