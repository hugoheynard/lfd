import type { MarketAdoptionView } from "@lfd/contracts";

/**
 * **Adoption par territoire** — dérivation PURE de la pénétration. `penetration` =
 * sociétés activées / acteurs visés (0..1) ; `deltaPts` = points de % gagnés sur la
 * période (activations depuis le début de la fenêtre, le dénominateur étant quasi
 * constant). Déterministe (temps injecté). Trie par pénétration décroissante.
 */

/** Cible d'une zone : son code postal et le nombre d'acteurs visés stocké. */
export interface ZoneTarget {
  readonly codePostal: string;
  readonly addressable: number;
}

/** Activations d'une zone : total à ce jour, part antérieure au début de la période. */
export interface ActivatedInZone {
  readonly ville: string;
  readonly total: number;
  readonly beforeStart: number;
}

export function computeAdoption(
  zones: readonly ZoneTarget[],
  activated: ReadonlyMap<string, ActivatedInZone>,
  now: Date,
): MarketAdoptionView {
  const rows = zones.map((zone) => {
    const a = activated.get(zone.codePostal);
    const total = a?.total ?? 0;
    const before = a?.beforeStart ?? 0;
    const penetration = zone.addressable > 0 ? total / zone.addressable : 0;
    const deltaPts = zone.addressable > 0 ? ((total - before) / zone.addressable) * 100 : 0;
    return {
      codePostal: zone.codePostal,
      ville: a?.ville ?? "",
      addressable: zone.addressable,
      activated: total,
      penetration,
      deltaPts,
    };
  });
  rows.sort((x, y) => y.penetration - x.penetration || y.activated - x.activated);
  return { zones: rows, computedAt: now.toISOString() };
}
