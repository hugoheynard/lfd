import {
  CardRefundRequest,
  type CardRefundRequestIntent,
  type CardRefundRequestSnapshot,
} from "../card-refund-request.js";
import type { CardRefundRequestState } from "../../value-objects/card-refund-values.js";

/** Les instants des fixtures ne sont comparés qu'entre eux, jamais à l'horloge. */
export const AT = new Date("2030-01-10T09:00:00.000Z");
export const LATER = new Date("2030-01-10T09:05:00.000Z");

export function intent(overrides: Partial<CardRefundRequestIntent> = {}): CardRefundRequestIntent {
  return {
    id: "req_1",
    paymentId: "pay_1",
    form: "remainder",
    amountCents: null,
    nature: "return",
    reason: "cancellation",
    announcedCents: 2_340,
    requestedAt: AT,
    requestedBy: "staff_1",
    firstAttemptAt: AT,
    ...overrides,
  };
}

/** Ce qu'un geste lève — `null` s'il ne lève pas. */
export function thrownBy(gesture: () => void): unknown {
  try {
    gesture();
    return null;
  } catch (error) {
    return error;
  }
}

/** Une demande relue dans l'état voulu, comme la base la rendrait. */
export function inState(
  state: CardRefundRequestState,
  overrides: Partial<CardRefundRequestSnapshot> = {},
): CardRefundRequest {
  const born = CardRefundRequest.request(intent()).toPersistence().state;
  return CardRefundRequest.rehydrate({ ...born, state, ...overrides });
}
