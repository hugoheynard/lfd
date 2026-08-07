import type {
  LeadView,
  MomentumTrajectory,
  ProspectTemperature,
  ProspectView,
} from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";

/**
 * Projection **Prospects** — dérivée **du journal** (jamais des tables voisines).
 * La forme de sortie (`ProspectView`) est le contrat partagé `@lfd/contracts` ;
 * ici vit la **dérivation pure**.
 *
 * Un prospect = une **personne** qui a tenté l'expérience sans être encore cliente
 * convertie : **hot** = a passé commande ; **mid** = inscrit, zéro commande. La
 * température décroît avec la **récence** — un état calculé, pas gravé. Le
 * **momentum** (vitesse du rythme de commande, 2 fenêtres 14 j) servira du même
 * moteur au churn côté client.
 */

/** Un événement du journal, réduit à ce que la projection prospects lit. */
export interface ProspectEvent {
  readonly type: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MOMENTUM_WINDOW_MS = 14 * DAY_MS;

/**
 * Trajectoire du rythme, sur deux fenêtres glissantes de 14 jours ancrées à
 * `now` (via le `Clock`). Zéro commande récente ⇒ `dormant` ; sinon la fenêtre
 * récente comparée à la précédente donne accélère / stable / refroidit.
 */
export function momentumOf(orderDates: readonly Date[], now: Date): MomentumTrajectory {
  const recentFrom = now.getTime() - MOMENTUM_WINDOW_MS;
  const priorFrom = now.getTime() - 2 * MOMENTUM_WINDOW_MS;
  let recent = 0;
  let prior = 0;
  for (const date of orderDates) {
    const time = date.getTime();
    if (time > recentFrom) {
      recent += 1;
    } else if (time > priorFrom) {
      prior += 1;
    }
  }
  if (recent === 0) {
    return "dormant";
  }
  if (recent > prior) {
    return "accelerating";
  }
  if (recent < prior) {
    return "cooling";
  }
  return "stable";
}

/**
 * Dérive les prospects d'un flux d'événements (types `user.registered` /
 * `order.placed`, sujet = personne). **Pure et déterministe** (testable sans I/O,
 * temps injecté via `now`).
 *
 * Exclut les personnes qui **transactent pour une société** (une commande au
 * `companyId` non nul) : elles ne sont plus de simples prospects. Trie hot avant
 * mid, puis par récence (le plus frais d'abord).
 */
export function deriveProspects(events: readonly ProspectEvent[], now: Date): ProspectView[] {
  const bySubject = new Map<string, ProspectEvent[]>();
  for (const event of events) {
    const bucket = bySubject.get(event.subjectId) ?? [];
    bucket.push(event);
    bySubject.set(event.subjectId, bucket);
  }

  const prospects: ProspectView[] = [];
  for (const [subjectId, subjectEvents] of bySubject) {
    const orders = subjectEvents.filter((event) => event.type === ACTIVITY_TYPES.orderPlaced);
    // Transacte pour une société ⇒ pas un prospect (client établi ou en cours).
    if (orders.some((order) => stringOrNull(order.payload["companyId"]) !== null)) {
      continue;
    }

    const firstSeenAt = minDate(subjectEvents.map((event) => event.occurredAt));
    const lastOrderAt = orders.length > 0 ? maxDate(orders.map((order) => order.occurredAt)) : null;
    const anchor = lastOrderAt ?? firstSeenAt;

    const email = latestEmail(subjectEvents);
    prospects.push({
      subjectId,
      email,
      temperature: orders.length > 0 ? "hot" : "mid",
      // hot/mid sont **entrants** (self-service) ; le cold (sortant) vient de
      // l'agrégat `Lead`, uni à cette projection par le reader.
      source: "inbound",
      label: email === "" ? subjectId : email,
      momentum: momentumOf(
        orders.map((order) => order.occurredAt),
        now,
      ),
      orderCount: orders.length,
      totalCents: orders.reduce((sum, order) => sum + numberOrZero(order.payload["totalCents"]), 0),
      lastOrderAt: lastOrderAt?.toISOString() ?? null,
      firstSeenAt: firstSeenAt.toISOString(),
      recencyDays: Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / DAY_MS)),
      // Entrant : pas d'agrégat lead, donc pas de statut de pipeline.
      leadStatus: null,
    });
  }

  return prospects.sort(byTemperatureThenRecency);
}

/** Statuts de lead **actifs** (non clos) — les seuls qui entrent dans la file. */
const ACTIVE_LEAD_STATUSES: ReadonlySet<string> = new Set([
  "new",
  "contacted",
  "qualified",
  "negotiating",
]);

/**
 * Mappe les **leads cold actifs** (démarchage sortant) vers des `ProspectView`.
 * Pure et déterministe (temps injecté). Les leads **clos** sont écartés : un
 * `converted` réapparaît côté entrant via le journal (il s'est inscrit), un `lost`
 * a quitté la file — c'est la **déduplication** entre l'agrégat et la projection.
 * Un cold n'a ni commande ni rythme (`momentum` dormant), sa récence court depuis
 * le dernier contact, sinon la saisie.
 */
export function coldProspectsFrom(leads: readonly LeadView[], now: Date): ProspectView[] {
  return leads
    .filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status))
    .map((lead) => {
      const anchor = new Date(lead.lastContactedAt ?? lead.createdAt);
      return {
        subjectId: lead.id,
        email: lead.email,
        temperature: "cold" as const,
        source: "outbound" as const,
        momentum: "dormant" as const,
        orderCount: 0,
        totalCents: 0,
        lastOrderAt: null,
        firstSeenAt: lead.createdAt,
        recencyDays: Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / DAY_MS)),
        label: lead.businessName,
        // Le statut du lead voyage jusqu'au front → actions de suivi en ligne.
        leadStatus: lead.status,
      };
    });
}

/**
 * Fusionne la projection entrante (hot/mid, journal) et les leads cold (agrégat),
 * triés ensemble : hot → mid → cold, puis par récence. C'est la **file entrante**
 * unifiée de l'onglet Prospects.
 */
export function mergeProspects(
  inbound: readonly ProspectView[],
  leads: readonly LeadView[],
  now: Date,
): ProspectView[] {
  return [...inbound, ...coldProspectsFrom(leads, now)].sort(byTemperatureThenRecency);
}

/** Rang d'affichage de la température (hot le plus chaud, cold le plus froid). */
const TEMPERATURE_RANK: Record<ProspectTemperature, number> = { hot: 0, mid: 1, cold: 2 };

/** Par température (hot→mid→cold) ; à température égale, le plus récent d'abord. */
function byTemperatureThenRecency(a: ProspectView, b: ProspectView): number {
  if (a.temperature !== b.temperature) {
    return TEMPERATURE_RANK[a.temperature] - TEMPERATURE_RANK[b.temperature];
  }
  return a.recencyDays - b.recencyDays;
}

/** Le dernier e-mail porté par une inscription, ou chaîne vide. */
function latestEmail(events: readonly ProspectEvent[]): string {
  const registrations = events
    .filter((event) => event.type === ACTIVITY_TYPES.userRegistered)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const last = registrations.at(-1);
  return last ? stringOrEmpty(last.payload["email"]) : "";
}

function minDate(dates: readonly Date[]): Date {
  return dates.reduce((min, date) => (date.getTime() < min.getTime() ? date : min));
}

function maxDate(dates: readonly Date[]): Date {
  return dates.reduce((max, date) => (date.getTime() > max.getTime() ? date : max));
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
