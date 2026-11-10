import type { RescheduleCommerceOperationPayload } from "@lfd/contracts";

import type { OperationCalendarInput } from "../domain/entities/operation.js";
import type { OperationScheduleInput } from "../domain/value-objects/operation-schedule.js";

/**
 * Les dates du contrat vers l'agrégat. Le contrat a déjà vérifié que les
 * instants sont des ISO avec décalage ; les jours restent bruts, c'est
 * `CalendarDay` qui les juge.
 */
export function scheduleOf(
  payload: Omit<RescheduleCommerceOperationPayload, "showsOrderUntilTime">,
): OperationScheduleInput {
  return {
    announceFrom: new Date(payload.announceFrom),
    orderFrom: payload.orderFrom === null ? null : new Date(payload.orderFrom),
    orderUntil: new Date(payload.orderUntil),
    pickupFrom: payload.pickupFrom,
    pickupUntil: payload.pickupUntil,
  };
}

/**
 * Le calendrier entier. `showsOrderUntilTime` absent = on l'affiche : un
 * écran d'avant le réglage (2026-10-16) ne doit ni être refusé, ni l'éteindre.
 */
export function calendarOf(payload: RescheduleCommerceOperationPayload): OperationCalendarInput {
  return {
    schedule: scheduleOf(payload),
    showsOrderUntilTime: payload.showsOrderUntilTime ?? true,
  };
}
