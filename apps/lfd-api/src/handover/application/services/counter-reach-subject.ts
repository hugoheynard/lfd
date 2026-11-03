import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import type { CounterReachSubject } from "../../domain/services/counter-reach.js";

/**
 * Ce que la garde du comptoir lit d'un sujet — partagé par le geste
 * (`AttestingCounterHandoverDesk.vet`) et son aperçu (C1b, 2026-11-03). Le
 * jour est la clé de la file du comptoir, écrite comme elle (`expectedOn`).
 */
export function counterReachSubjectOf(subject: HandoverSubject): CounterReachSubject {
  return {
    fulfillmentMethod: subject.fulfillmentMethod,
    serviceDay: subject.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
  };
}
