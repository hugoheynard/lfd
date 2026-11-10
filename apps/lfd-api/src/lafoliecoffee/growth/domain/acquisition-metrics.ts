import type { AcquisitionMetricsView } from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import { dayKey } from "./growth-stats.js";

/** Événement de journal minimal pour les métriques d'acquisition. */
export interface AcquisitionEvent {
  readonly type: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
}

/**
 * **Acquisition & churn au grain jour** (pur) : projette sur `window` les inscriptions,
 * les **1res commandes** (une seule par personne — la date du 1er `order.placed` de ce
 * sujet, même si elle tombe hors fenêtre : seul le comptage est fenêtré), les leads
 * saisis et les **résiliations confirmées** (churn brut, dates fournies à part car
 * elles ne vivent pas dans le journal mais dans `company_terminations`).
 */
export function computeAcquisitionMetrics(
  window: readonly string[],
  events: readonly AcquisitionEvent[],
  terminationDates: readonly Date[],
  now: Date,
): AcquisitionMetricsView {
  const registrations = countByDay(events, ACTIVITY_TYPES.userRegistered);
  const leads = countByDay(events, ACTIVITY_TYPES.leadCaptured);
  const firstOrders = countDays(firstOrderDays(events));
  const terminations = countDays(terminationDates.map(dayKey));
  const at =
    (m: ReadonlyMap<string, number>) =>
    (day: string): number =>
      m.get(day) ?? 0;
  return {
    days: [...window],
    registrations: window.map(at(registrations)),
    firstOrders: window.map(at(firstOrders)),
    leads: window.map(at(leads)),
    terminations: window.map(at(terminations)),
    computedAt: now.toISOString(),
  };
}

/** Compte par jour les événements d'un type donné. */
function countByDay(events: readonly AcquisitionEvent[], type: string): Map<string, number> {
  return countDays(events.filter((e) => e.type === type).map((e) => dayKey(e.occurredAt)));
}

/** Le jour de la **1re** commande de chaque personne (une entrée par sujet). */
function firstOrderDays(events: readonly AcquisitionEvent[]): string[] {
  const first = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== ACTIVITY_TYPES.orderPlaced) {
      continue;
    }
    const prev = first.get(e.subjectId);
    if (prev === undefined || e.occurredAt < prev) {
      first.set(e.subjectId, e.occurredAt);
    }
  }
  return [...first.values()].map(dayKey);
}

/** Histogramme d'une liste de jours ISO. */
function countDays(days: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of days) {
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}
