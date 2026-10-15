import type { RescheduleCommerceOperationPayload } from "@lfd/contracts";

import type { OperationScheduleInput } from "../domain/value-objects/operation-schedule.js";

/**
 * Les dates du contrat vers l'agrégat. Le contrat a déjà vérifié que les
 * instants sont des ISO avec décalage ; les jours restent bruts, c'est
 * `CalendarDay` qui les juge.
 */
export function scheduleOf(payload: RescheduleCommerceOperationPayload): OperationScheduleInput {
  return {
    announceFrom: new Date(payload.announceFrom),
    orderFrom: payload.orderFrom === null ? null : new Date(payload.orderFrom),
    orderUntil: new Date(payload.orderUntil),
    pickupFrom: payload.pickupFrom,
    pickupUntil: payload.pickupUntil,
  };
}
