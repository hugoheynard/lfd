import { LOYALTY_REASON_MAX } from "@lfd/contracts";

import { InvalidLoyaltyReasonError } from "../errors/loyalty-errors.js";

/**
 * **Le motif d'un geste du staff** sur le livre ou sur un bon. Obligatoire :
 * un ajustement sans motif est une écriture d'argent que personne ne saura
 * expliquer. La base le tient aussi (`CHECK` sur `reason`).
 */
export class LoyaltyReason {
  private constructor(readonly text: string) {}

  /** @throws {InvalidLoyaltyReasonError} vide une fois rogné, ou trop long. */
  static of(raw: string): LoyaltyReason {
    const text = raw.trim();
    if (text === "" || text.length > LOYALTY_REASON_MAX) {
      throw new InvalidLoyaltyReasonError(LOYALTY_REASON_MAX);
    }
    return new LoyaltyReason(text);
  }
}
