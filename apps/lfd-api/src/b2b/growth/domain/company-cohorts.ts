import type { CohortRow } from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import { shiftWeek, weekStart, type GrowthStatsEvent } from "./growth-week.js";

/**
 * Les **commandes de société** et les **cohortes de sociétés déclarées** des
 * statistiques de croissance. Extraites de `growth-stats.ts` au lot P3
 * (2026-10-25), quand les cohortes ont cessé d'être celles des personnes
 * inscrites — particuliers compris — pour devenir celles des sociétés.
 */

/** Une commande passée pour une société : la seule que le poste commercial compte. */
export interface CompanyOrder {
  readonly companyId: string;
  readonly occurredAt: Date;
  readonly totalCents: number;
}

/** Les `order.placed` au `companyId` renseigné — ceux d'un particulier sont écartés. */
export function companyOrdersOf(userEvents: readonly GrowthStatsEvent[]): CompanyOrder[] {
  const out: CompanyOrder[] = [];
  for (const e of userEvents) {
    const companyId = e.payload["companyId"];
    if (
      e.type === ACTIVITY_TYPES.orderPlaced &&
      typeof companyId === "string" &&
      companyId !== ""
    ) {
      out.push({
        companyId,
        occurredAt: e.occurredAt,
        totalCents: numberOr0(e.payload["totalCents"]),
      });
    }
  }
  return out;
}

/** Cohortes de rétention : par semaine de déclaration, part des sociétés ayant commandé en semaine +k. */
export function cohorts(
  companyEvents: readonly GrowthStatsEvent[],
  orders: readonly CompanyOrder[],
  window: readonly string[],
): CohortRow[] {
  const declaredWeekByCompany = firstEventWeekBySubject(
    companyEvents,
    ACTIVITY_TYPES.companyDeclared,
  );
  const orderWeeksByCompany = orderWeeksByCompanyMap(orders);
  const byDeclaration = new Map<string, string[]>();
  for (const [companyId, week] of declaredWeekByCompany) {
    if (window.includes(week)) {
      const bucket = byDeclaration.get(week) ?? [];
      bucket.push(companyId);
      byDeclaration.set(week, bucket);
    }
  }
  return window
    .filter((week) => byDeclaration.has(week))
    .map((week) => cohortRow(week, byDeclaration.get(week) ?? [], orderWeeksByCompany, window));
}

function cohortRow(
  week: string,
  members: readonly string[],
  orderWeeksByMember: Map<string, Set<string>>,
  window: readonly string[],
): CohortRow {
  const span = window.length - window.indexOf(week);
  const retention: number[] = [];
  for (let k = 0; k < span; k += 1) {
    const target = shiftWeek(week, k);
    const active = members.filter((m) => orderWeeksByMember.get(m)?.has(target) === true).length;
    retention.push(members.length === 0 ? 0 : active / members.length);
  }
  return { cohortWeek: week, size: members.length, retention };
}

/** Première commande de chaque société. */
export function firstOrderByCompany(orders: readonly CompanyOrder[]): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const o of orders) {
    const prev = first.get(o.companyId);
    if (prev === undefined || o.occurredAt.getTime() < prev.getTime()) {
      first.set(o.companyId, o.occurredAt);
    }
  }
  return first;
}

function firstEventWeekBySubject(
  events: readonly GrowthStatsEvent[],
  type: string,
): Map<string, string> {
  const first = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== type) {
      continue;
    }
    const prev = first.get(e.subjectId);
    if (prev === undefined || e.occurredAt.getTime() < prev.getTime()) {
      first.set(e.subjectId, e.occurredAt);
    }
  }
  const out = new Map<string, string>();
  for (const [subject, date] of first) {
    out.set(subject, weekStart(date));
  }
  return out;
}

function orderWeeksByCompanyMap(orders: readonly CompanyOrder[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const o of orders) {
    const weeks = out.get(o.companyId) ?? new Set<string>();
    weeks.add(weekStart(o.occurredAt));
    out.set(o.companyId, weeks);
  }
  return out;
}

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
