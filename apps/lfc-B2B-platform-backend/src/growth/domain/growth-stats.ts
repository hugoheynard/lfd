import type {
  AcquisitionPoint,
  CohortRow,
  FunnelStep,
  GrowthKpis,
  GrowthStatsView,
  LeadView,
  ProspectView,
} from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import { deriveActivations } from "./activation.js";
import {
  accountConcentration,
  acquisitionMix,
  lifecycleFlow,
  velocityMetrics,
} from "./growth-stats-advanced.js";
import { deriveProspects } from "./prospect.js";
import { temperatureFlow } from "./temperature-flow.js";

/**
 * **Stats de croissance** — la dérivation PURE derrière l'onglet Croissance et le
 * rappel du dashboard. Compose les projections existantes (prospects, activations)
 * et calcule les séries temporelles (acquisition hebdo), la distribution de
 * momentum, les entonnoirs (cold + activation) et les **cohortes de rétention**.
 * Déterministe (temps injecté) ; lit le journal + les leads, jamais les tables
 * voisines. Bucketing hebdo au lundi UTC (raffinement Europe/Paris = plus tard).
 */
export interface GrowthStatsEvent {
  readonly type: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly payload: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ACTIVE_LEAD = new Set(["new", "contacted", "qualified", "negotiating"]);
const LEAD_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  negotiating: 3,
  converted: 4,
};

export function deriveGrowthStats(
  events: readonly GrowthStatsEvent[],
  leads: readonly LeadView[],
  now: Date,
  weeks = 13,
): GrowthStatsView {
  const userEvents = events.filter((e) => e.subjectType === "user");
  const companyEvents = events.filter((e) => e.subjectType === "company");
  const leadEvents = events.filter((e) => e.subjectType === "lead");
  const prospects = deriveProspects(userEvents, now);
  const activations = deriveActivations(companyEvents, now);
  const window = weekStarts(now, weeks);

  return {
    kpis: kpis(prospects, activations, leads, userEvents),
    acquisition: acquisition(userEvents, window),
    temperatureFlow: temperatureFlow(userEvents, leadEvents, window),
    coldFunnel: coldFunnel(leads),
    activationFunnel: activationFunnel(activations),
    cohorts: cohorts(userEvents, window),
    lifecycle: lifecycleFlow(events),
    velocity: velocityMetrics(events),
    concentration: accountConcentration(userEvents),
    acquisitionMix: acquisitionMix(events, window),
    weeks,
    computedAt: now.toISOString(),
  };
}

function kpis(
  prospects: readonly ProspectView[],
  activations: readonly { status: string }[],
  leads: readonly LeadView[],
  userEvents: readonly GrowthStatsEvent[],
): GrowthKpis {
  const hot = prospects.filter((p) => p.temperature === "hot").length;
  const mid = prospects.filter((p) => p.temperature === "mid").length;
  const cold = leads.filter((l) => ACTIVE_LEAD.has(l.status)).length;
  const orders = userEvents.filter((e) => e.type === ACTIVITY_TYPES.orderPlaced);
  const declared = activations.length;
  const activated = activations.filter((a) => a.status === "active").length;
  return {
    prospects: hot + mid + cold,
    hot,
    mid,
    cold,
    activeLeads: cold,
    orders: orders.length,
    ordersTotalCents: orders.reduce((s, e) => s + numberOr0(e.payload["totalCents"]), 0),
    companiesDeclared: declared,
    companiesActivated: activated,
    conversionRate: declared === 0 ? 0 : activated / declared,
  };
}

/** Acquisition hebdo : inscriptions, 1res commandes, leads saisis par semaine. */
function acquisition(
  userEvents: readonly GrowthStatsEvent[],
  window: readonly string[],
): AcquisitionPoint[] {
  const reg = countByWeek(userEvents, ACTIVITY_TYPES.userRegistered, window);
  const leads = countByWeek(userEvents, ACTIVITY_TYPES.leadCaptured, window);
  const firsts = firstOrderWeeks(userEvents);
  const firstByWeek = new Map<string, number>();
  for (const w of firsts) {
    firstByWeek.set(w, (firstByWeek.get(w) ?? 0) + 1);
  }
  return window.map((weekStart) => ({
    weekStart,
    registrations: reg.get(weekStart) ?? 0,
    firstOrders: firstByWeek.get(weekStart) ?? 0,
    leadsCaptured: leads.get(weekStart) ?? 0,
  }));
}

/** Entonnoir cold : progression pipeline (marche = leads ayant atteint ≥ l'étape). */
function coldFunnel(leads: readonly LeadView[]): FunnelStep[] {
  const rankOf = (l: LeadView): number => LEAD_RANK[l.status] ?? -1;
  const atLeast = (r: number): number => leads.filter((l) => rankOf(l) >= r).length;
  return [
    { key: "captured", label: "Saisis", count: leads.length },
    { key: "contacted", label: "Contactés", count: atLeast(1) },
    { key: "qualified", label: "Qualifiés", count: atLeast(2) },
    { key: "negotiating", label: "En négociation", count: atLeast(3) },
    { key: "converted", label: "Convertis", count: atLeast(4) },
  ];
}

/** Entonnoir d'activation : déclaré → pièces → activé (les fuites = frictions). */
function activationFunnel(
  activations: readonly { status: string; stepsReached: readonly string[] }[],
): FunnelStep[] {
  const reached = (step: string): number =>
    activations.filter((a) => a.stepsReached.includes(step)).length;
  return [
    { key: "declared", label: "Déclarées", count: activations.length },
    { key: "tva", label: "TVA", count: reached("tva") },
    { key: "kbis", label: "KBIS", count: reached("kbis") },
    { key: "billing", label: "Facturation", count: reached("billing") },
    { key: "delivery", label: "Livraison", count: reached("delivery") },
    {
      key: "activated",
      label: "Activées",
      count: activations.filter((a) => a.status === "active").length,
    },
  ];
}

/** Cohortes de rétention : par semaine d'inscription, part ayant commandé en semaine +k. */
function cohorts(userEvents: readonly GrowthStatsEvent[], window: readonly string[]): CohortRow[] {
  const regWeekByUser = firstEventWeekByUser(userEvents, ACTIVITY_TYPES.userRegistered);
  const orderWeeksByUser = orderWeeksByUserMap(userEvents);
  const bySignup = new Map<string, string[]>();
  for (const [userId, week] of regWeekByUser) {
    if (window.includes(week)) {
      (bySignup.get(week) ?? bySignup.set(week, []).get(week)!).push(userId);
    }
  }
  return window
    .filter((week) => bySignup.has(week))
    .map((week) => cohortRow(week, bySignup.get(week) ?? [], orderWeeksByUser, window));
}

function cohortRow(
  week: string,
  users: readonly string[],
  orderWeeksByUser: Map<string, Set<string>>,
  window: readonly string[],
): CohortRow {
  const span = window.length - window.indexOf(week);
  const retention: number[] = [];
  for (let k = 0; k < span; k += 1) {
    const target = shiftWeek(week, k);
    const active = users.filter((u) => orderWeeksByUser.get(u)?.has(target) === true).length;
    retention.push(users.length === 0 ? 0 : active / users.length);
  }
  return { cohortWeek: week, size: users.length, retention };
}

// ── Helpers de bucketing hebdomadaire ──────────────────────────────────────────

export function weekStarts(now: Date, weeks: number): string[] {
  const current = weekStart(now);
  const out: string[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    out.push(shiftWeek(current, -i));
  }
  return out;
}

export function weekStart(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diff = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

function shiftWeek(weekStartIso: string, byWeeks: number): string {
  return new Date(new Date(`${weekStartIso}T00:00:00.000Z`).getTime() + byWeeks * WEEK_MS)
    .toISOString()
    .slice(0, 10);
}

function countByWeek(
  events: readonly GrowthStatsEvent[],
  type: string,
  window: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const set = new Set(window);
  for (const e of events) {
    if (e.type !== type) {
      continue;
    }
    const w = weekStart(e.occurredAt);
    if (set.has(w)) {
      out.set(w, (out.get(w) ?? 0) + 1);
    }
  }
  return out;
}

/** Semaine de la 1re commande de chaque personne (une entrée par personne). */
function firstOrderWeeks(events: readonly GrowthStatsEvent[]): string[] {
  const first = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== ACTIVITY_TYPES.orderPlaced) {
      continue;
    }
    const prev = first.get(e.subjectId);
    if (prev === undefined || e.occurredAt.getTime() < prev.getTime()) {
      first.set(e.subjectId, e.occurredAt);
    }
  }
  return [...first.values()].map(weekStart);
}

function firstEventWeekByUser(
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
  for (const [user, date] of first) {
    out.set(user, weekStart(date));
  }
  return out;
}

function orderWeeksByUserMap(events: readonly GrowthStatsEvent[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== ACTIVITY_TYPES.orderPlaced) {
      continue;
    }
    const set = out.get(e.subjectId) ?? out.set(e.subjectId, new Set()).get(e.subjectId)!;
    set.add(weekStart(e.occurredAt));
  }
  return out;
}

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
