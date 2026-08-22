import type {
  AccountConcentration,
  AcquisitionMixPoint,
  LifecycleFlow,
  LorenzPoint,
  Quantiles,
  VelocityMetric,
} from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import { weekStart, type GrowthStatsEvent } from "./growth-week.js";

/**
 * **Stats de croissance v2** (fonctions pures) : le flux de cycle de vie (Sankey),
 * la vélocité (délais → 1re commande / activation), la concentration du volume par
 * compte (Lorenz + Gini), et le mix product-led / sales-led dans le temps. Toutes
 * dérivées du journal, déterministes (temps injecté).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── L1 · Sankey du cycle de vie ────────────────────────────────────────────────

/**
 * Flux inscrit → (a commandé / sans commande) → (a déclaré / sans société) →
 * (activé / en cours). Les sociétés se rattachent à leur propriétaire via le
 * `ownerUserId` du `company.declared`.
 */
export function lifecycleFlow(events: readonly GrowthStatsEvent[]): LifecycleFlow {
  const registered = subjectsOf(events, ACTIVITY_TYPES.userRegistered, "user");
  const ordered = subjectsOf(events, ACTIVITY_TYPES.orderPlaced, "user");
  const declaredByOwner = new Map<string, string>(); // ownerUserId → companyId
  const activatedCompanies = new Set(
    events.filter((e) => e.type === ACTIVITY_TYPES.companyActivated).map((e) => e.subjectId),
  );
  for (const e of events) {
    if (e.type === ACTIVITY_TYPES.companyDeclared) {
      const owner = stringOrNull(e.payload["ownerUserId"]);
      if (owner !== null) {
        declaredByOwner.set(owner, e.subjectId);
      }
    }
  }

  let ordCount = 0;
  let noOrd = 0;
  let ordDeclared = 0;
  let noOrdDeclared = 0;
  for (const user of registered) {
    const hasOrder = ordered.has(user);
    const hasCompany = declaredByOwner.has(user);
    if (hasOrder) {
      ordCount += 1;
      if (hasCompany) {
        ordDeclared += 1;
      }
    } else {
      noOrd += 1;
      if (hasCompany) {
        noOrdDeclared += 1;
      }
    }
  }
  const declared = ordDeclared + noOrdDeclared;
  const activated = [...declaredByOwner.values()].filter((c) => activatedCompanies.has(c)).length;

  const nodes = [
    { key: "registered", label: "Inscrits" },
    { key: "ordered", label: "A commandé" },
    { key: "noOrder", label: "Sans commande" },
    { key: "declared", label: "A déclaré" },
    { key: "activated", label: "Activé" },
    { key: "inProgress", label: "En cours" },
  ];
  const links = [
    { source: "registered", target: "ordered", value: ordCount },
    { source: "registered", target: "noOrder", value: noOrd },
    { source: "ordered", target: "declared", value: ordDeclared },
    { source: "noOrder", target: "declared", value: noOrdDeclared },
    { source: "declared", target: "activated", value: activated },
    { source: "declared", target: "inProgress", value: Math.max(0, declared - activated) },
  ].filter((l) => l.value > 0);
  return { nodes, links };
}

// ── L2 · Vélocité (délais) ─────────────────────────────────────────────────────

/** Délais → 1re commande et → activation : distribution + tendance de la médiane. */
export function velocityMetrics(events: readonly GrowthStatsEvent[]): VelocityMetric[] {
  return [
    metric(
      "first_order",
      "Temps → 1re commande",
      delaysBetween(
        firstByUser(events, ACTIVITY_TYPES.userRegistered),
        firstByUser(events, ACTIVITY_TYPES.orderPlaced),
      ),
    ),
    metric(
      "activation",
      "Temps → activation",
      delaysBetween(
        firstBySubject(events, ACTIVITY_TYPES.companyDeclared),
        firstBySubject(events, ACTIVITY_TYPES.companyActivated),
      ),
    ),
  ];
}

/** Construit un `VelocityMetric` depuis une liste de (délai jours, semaine de départ). */
function metric(
  key: string,
  label: string,
  samples: readonly { days: number; startWeek: string }[],
): VelocityMetric {
  const days = samples.map((s) => s.days).sort((a, b) => a - b);
  const byWeek = new Map<string, number[]>();
  for (const s of samples) {
    const bucket = byWeek.get(s.startWeek);
    if (bucket === undefined) {
      byWeek.set(s.startWeek, [s.days]);
    } else {
      bucket.push(s.days);
    }
  }
  const trend = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStartIso, values]) => ({
      weekStart: weekStartIso,
      median: quantile(
        values.slice().sort((x, y) => x - y),
        0.5,
      ),
    }));
  return { key, label, quantiles: quantiles(days), count: days.length, trend };
}

/** Délai (jours) entre deux instants par clé commune (start → end, end après start). */
function delaysBetween(
  starts: Map<string, Date>,
  ends: Map<string, Date>,
): { days: number; startWeek: string }[] {
  const out: { days: number; startWeek: string }[] = [];
  for (const [key, start] of starts) {
    const end = ends.get(key);
    if (end !== undefined && end.getTime() >= start.getTime()) {
      out.push({ days: (end.getTime() - start.getTime()) / DAY_MS, startWeek: weekStart(start) });
    }
  }
  return out;
}

// ── L3 · Concentration du volume par compte (Lorenz + Gini) ────────────────────

/** Concentration du volume de commandes par **acheteur** (compte). */
export function accountConcentration(events: readonly GrowthStatsEvent[]): AccountConcentration {
  const volumeByAccount = new Map<string, number>();
  for (const e of events) {
    if (e.type === ACTIVITY_TYPES.orderPlaced) {
      const account = stringOrNull(e.payload["companyId"]) ?? e.subjectId;
      volumeByAccount.set(
        account,
        (volumeByAccount.get(account) ?? 0) + numberOr0(e.payload["totalCents"]),
      );
    }
  }
  return concentrationOf(volumeByAccount);
}

/**
 * Courbe de Lorenz + Gini + part du décile de tête, depuis un volume **par acheteur**.
 * Extrait pour être partagé : la concentration se calcule aussi depuis la table
 * `orders` (source de vérité du CA), pas seulement depuis le journal.
 */
export function concentrationOf(
  volumeByAccount: ReadonlyMap<string, number>,
): AccountConcentration {
  const volumes = [...volumeByAccount.values()].sort((a, b) => a - b);
  const total = volumes.reduce((s, v) => s + v, 0);
  const accounts = volumes.length;
  if (accounts === 0 || total === 0) {
    return {
      lorenz: [{ cumAccounts: 0, cumVolume: 0 }],
      gini: 0,
      topDecileShare: 0,
      accounts,
      totalVolumeCents: total,
    };
  }
  const lorenz: LorenzPoint[] = [{ cumAccounts: 0, cumVolume: 0 }];
  let cum = 0;
  volumes.forEach((v, i) => {
    cum += v;
    lorenz.push({ cumAccounts: (i + 1) / accounts, cumVolume: cum / total });
  });
  const topDecileCount = Math.max(1, Math.round(accounts * 0.1));
  const topVolume = volumes.slice(accounts - topDecileCount).reduce((s, v) => s + v, 0);
  return {
    lorenz,
    gini: giniFrom(lorenz),
    topDecileShare: topVolume / total,
    accounts,
    totalVolumeCents: total,
  };
}

/** Gini = 1 − 2·(aire sous Lorenz), aire par trapèzes. */
function giniFrom(lorenz: readonly LorenzPoint[]): number {
  let area = 0;
  for (let i = 1; i < lorenz.length; i += 1) {
    const a = lorenz[i - 1];
    const b = lorenz[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    area += ((b.cumAccounts - a.cumAccounts) * (a.cumVolume + b.cumVolume)) / 2;
  }
  return Math.max(0, Math.min(1, 1 - 2 * area));
}

// ── L4 · Mix product-led / sales-led ───────────────────────────────────────────

/**
 * Mix hebdo : **product-led** (self-service pur, zéro démarchage) vs **sales-led**
 * (staff ou lead). Un `company.declared` compte product-led s'il est `self`, sales-led
 * si `staff`. Un `lead.converted` compte **toujours** sales-led (un lead = origine
 * commerciale, même converti à l'inscription) — cf. décision D4 de commercial-data.
 * La part product-led est un indicateur de la qualité du référencement (auto-découverte).
 */
export function acquisitionMix(
  events: readonly GrowthStatsEvent[],
  window: readonly string[],
): AcquisitionMixPoint[] {
  const set = new Set(window);
  const product = new Map<string, number>();
  const sales = new Map<string, number>();
  const bump = (map: Map<string, number>, week: string): void => {
    if (set.has(week)) {
      map.set(week, (map.get(week) ?? 0) + 1);
    }
  };
  for (const e of events) {
    const week = weekStart(e.occurredAt);
    if (e.type === ACTIVITY_TYPES.companyDeclared) {
      bump(stringOrNull(e.payload["via"]) === "staff" ? sales : product, week);
    } else if (e.type === ACTIVITY_TYPES.leadConverted) {
      bump(sales, week);
    }
  }
  return window.map((weekStartIso) => ({
    weekStart: weekStartIso,
    productLed: product.get(weekStartIso) ?? 0,
    salesLed: sales.get(weekStartIso) ?? 0,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function subjectsOf(
  events: readonly GrowthStatsEvent[],
  type: string,
  subjectType: string,
): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.type === type && e.subjectType === subjectType) {
      out.add(e.subjectId);
    }
  }
  return out;
}

function firstByUser(events: readonly GrowthStatsEvent[], type: string): Map<string, Date> {
  return firstBySubject(events, type);
}

function firstBySubject(events: readonly GrowthStatsEvent[], type: string): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== type) {
      continue;
    }
    const prev = out.get(e.subjectId);
    if (prev === undefined || e.occurredAt.getTime() < prev.getTime()) {
      out.set(e.subjectId, e.occurredAt);
    }
  }
  return out;
}

function quantiles(sorted: readonly number[]): Quantiles {
  return {
    min: round1(quantile(sorted, 0)),
    q1: round1(quantile(sorted, 0.25)),
    median: round1(quantile(sorted, 0.5)),
    q3: round1(quantile(sorted, 0.75)),
    max: round1(quantile(sorted, 1)),
  };
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const lo = sorted[base] ?? 0;
  const hi = sorted[base + 1];
  return hi === undefined ? lo : lo + (pos - base) * (hi - lo);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function numberOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
