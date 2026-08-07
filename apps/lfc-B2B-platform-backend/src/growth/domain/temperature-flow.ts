import type { TemperatureFlowPoint } from "@lfd/contracts";

import { ACTIVITY_TYPES } from "./activity-event.js";
import type { GrowthStatsEvent } from "./growth-stats.js";

/**
 * **Momentum du vivier** — le flux de prospects par **chaleur**, période par période.
 *
 * À la clôture de chaque semaine de la fenêtre, on compte le **stock debout** dans
 * chaque bande (hot/mid/cold). Ce n'est pas un flux d'événements mais un état *tenu* :
 * une personne entre en s'inscrivant (mid), passe **hot** à sa 1re commande perso, et
 * **sort** du vivier à sa 1re commande pour une société (convertie) ; un lead cold est
 * debout de sa saisie jusqu'à sa fermeture (converti ou perdu). Reconstruit depuis le
 * journal, d'où un vrai flux temporel — pas un instantané. **Pur et déterministe**.
 *
 * Le bucketing hebdo suit celui du reste des stats (lundi UTC ; raffinement
 * Europe/Paris = plus tard).
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function temperatureFlow(
  userEvents: readonly GrowthStatsEvent[],
  leadEvents: readonly GrowthStatsEvent[],
  window: readonly string[],
): TemperatureFlowPoint[] {
  const people = personTimelines(userEvents);
  const leads = leadTimelines(leadEvents);
  return window.map((weekStart) => {
    // Borne = clôture de la semaine (début de la suivante) : stock cumulé à cette date.
    const asOf = new Date(`${weekStart}T00:00:00.000Z`).getTime() + WEEK_MS;
    let hot = 0;
    let mid = 0;
    let cold = 0;
    for (const p of people.values()) {
      const band = personBandAt(p, asOf);
      if (band === "hot") {
        hot += 1;
      } else if (band === "mid") {
        mid += 1;
      }
    }
    for (const l of leads.values()) {
      if (l.capturedAt <= asOf && (l.closedAt === null || l.closedAt > asOf)) {
        cold += 1;
      }
    }
    return { weekStart, hot, mid, cold };
  });
}

/** Jalons temporels d'une personne, réduits à ce qui décide sa bande. */
interface PersonTimeline {
  readonly registeredAt: number | null;
  readonly firstPersonalOrderAt: number | null;
  readonly firstCompanyOrderAt: number | null;
}

function personTimelines(userEvents: readonly GrowthStatsEvent[]): Map<string, PersonTimeline> {
  const raw = new Map<
    string,
    { registeredAt: number | null; personal: number | null; company: number | null }
  >();
  for (const e of userEvents) {
    const cur = raw.get(e.subjectId) ?? { registeredAt: null, personal: null, company: null };
    const at = e.occurredAt.getTime();
    if (e.type === ACTIVITY_TYPES.userRegistered) {
      cur.registeredAt = earliest(cur.registeredAt, at);
    } else if (e.type === ACTIVITY_TYPES.orderPlaced) {
      if (stringOrNull(e.payload["companyId"]) !== null) {
        cur.company = earliest(cur.company, at);
      } else {
        cur.personal = earliest(cur.personal, at);
      }
    }
    raw.set(e.subjectId, cur);
  }
  const out = new Map<string, PersonTimeline>();
  for (const [id, v] of raw) {
    out.set(id, {
      registeredAt: v.registeredAt,
      firstPersonalOrderAt: v.personal,
      firstCompanyOrderAt: v.company,
    });
  }
  return out;
}

/** Bande d'une personne à l'instant `asOf`, ou `null` si hors vivier (absente ou sortie). */
function personBandAt(p: PersonTimeline, asOf: number): "hot" | "mid" | null {
  if (p.firstCompanyOrderAt !== null && p.firstCompanyOrderAt <= asOf) {
    return null; // convertie : a commandé pour une société.
  }
  if (p.firstPersonalOrderAt !== null && p.firstPersonalOrderAt <= asOf) {
    return "hot";
  }
  if (p.registeredAt !== null && p.registeredAt <= asOf) {
    return "mid";
  }
  return null; // pas encore entrée.
}

/** Fenêtre d'activité d'un lead cold : saisi puis (éventuellement) fermé. */
interface LeadTimeline {
  readonly capturedAt: number;
  readonly closedAt: number | null;
}

function leadTimelines(leadEvents: readonly GrowthStatsEvent[]): Map<string, LeadTimeline> {
  const captured = new Map<string, number>();
  const closed = new Map<string, number>();
  for (const e of leadEvents) {
    const at = e.occurredAt.getTime();
    if (e.type === ACTIVITY_TYPES.leadCaptured) {
      captured.set(e.subjectId, earliest(captured.get(e.subjectId) ?? null, at));
    } else if (e.type === ACTIVITY_TYPES.leadConverted || e.type === ACTIVITY_TYPES.leadLost) {
      closed.set(e.subjectId, earliest(closed.get(e.subjectId) ?? null, at));
    }
  }
  const out = new Map<string, LeadTimeline>();
  for (const [id, capturedAt] of captured) {
    out.set(id, { capturedAt, closedAt: closed.get(id) ?? null });
  }
  return out;
}

function earliest(current: number | null, candidate: number): number {
  return current === null || candidate < current ? candidate : current;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
