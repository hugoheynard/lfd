import type {
  MarketAdoptionView,
  PenetrationTrendPoint,
  ZonePenetrationTrend,
} from "@lfd/contracts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Adoption par territoire** — dérivation PURE de la pénétration. `penetration` =
 * sociétés activées / acteurs visés (0..1) ; `deltaPts` = points de % gagnés sur la
 * période (activations depuis le début de la fenêtre, le dénominateur étant quasi
 * constant). Déterministe (temps injecté). Trie par pénétration décroissante.
 */

/**
 * **Part de marché dans le temps** (pure) : pour chaque semaine de la fenêtre, la
 * pénétration CUMULÉE = nombre d'activations à la clôture de la semaine / total
 * des acteurs visés. Le dénominateur est constant sur la fenêtre (quasi-invariant),
 * donc la courbe monte au rythme des activations. C'est le « stock » qui monte
 * derrière le flux d'acquisition (graphe composé §2.1).
 */
export function penetrationTrend(
  window: readonly string[],
  activationDates: readonly Date[],
  totalAddressable: number,
): PenetrationTrendPoint[] {
  const times = activationDates.map((d) => d.getTime()).sort((a, b) => a - b);
  return window.map((weekStartIso) => {
    const weekEnd = new Date(`${weekStartIso}T00:00:00.000Z`).getTime() + WEEK_MS;
    const cumulative = times.filter((t) => t < weekEnd).length;
    const penetration = totalAddressable > 0 ? cumulative / totalAddressable : 0;
    return { weekStart: weekStartIso, penetration };
  });
}

/** Cible d'une zone : son code postal et le nombre d'acteurs visés stocké. */
export interface ZoneTarget {
  readonly codePostal: string;
  readonly addressable: number;
}

/** Activations d'une zone : total à ce jour, part antérieure au début, et pertes. */
export interface ActivatedInZone {
  readonly ville: string;
  readonly total: number;
  readonly beforeStart: number;
  /** Sociétés résiliées (`terminated`) rattachées à la zone. */
  readonly lost: number;
}

export function computeAdoption(
  zones: readonly ZoneTarget[],
  activated: ReadonlyMap<string, ActivatedInZone>,
  trend: readonly PenetrationTrendPoint[],
  zoneTrends: readonly ZonePenetrationTrend[],
  now: Date,
): MarketAdoptionView {
  const rows = zones.map((zone) => {
    const a = activated.get(zone.codePostal);
    const total = a?.total ?? 0;
    const before = a?.beforeStart ?? 0;
    const lost = a?.lost ?? 0;
    const penetration = zone.addressable > 0 ? total / zone.addressable : 0;
    const deltaPts = zone.addressable > 0 ? ((total - before) / zone.addressable) * 100 : 0;
    return {
      codePostal: zone.codePostal,
      ville: a?.ville ?? "",
      addressable: zone.addressable,
      activated: total,
      penetration,
      deltaPts,
      lost,
      // Taux de churn BORNÉ 0–1 : résiliées / (actives + résiliées) = part de la base
      // onboardée qui est repartie. (Rapporter au pool cumulerait sans plafond.)
      lostRate: total + lost > 0 ? lost / (total + lost) : 0,
    };
  });
  rows.sort((x, y) => y.penetration - x.penetration || y.activated - x.activated);
  return { zones: rows, trend, zoneTrends, computedAt: now.toISOString() };
}
