import type { MarketSectorsView, SectorMovement, ZoneSectorMovements } from "@lfd/contracts";

/** Config d'une zone pour le mix secteurs : code, ville résolue, pool par NAF. */
export interface SectorZoneConfig {
  readonly codePostal: string;
  readonly ville: string;
  /** `nafCode` → pool max du secteur dans la zone (acteurs visés). */
  readonly pools: ReadonlyMap<string, number>;
}

/** Compteurs observés d'un secteur : actives / résiliées. */
export interface SectorCounts {
  active: number;
  terminated: number;
}

/**
 * **Mix des types de clients par territoire** (pur) : pour chaque zone et chaque
 * **secteur NAF ciblé**, assemble le pool (config) et les comptes actives/résiliées
 * (observés). On itère sur les NAF *configurés* (assiette stable, comparable entre
 * zones), les codes hors cible sont ignorés. Déterministe.
 */
export function computeSectorMovements(
  zones: readonly SectorZoneConfig[],
  nafLabels: ReadonlyMap<string, string>,
  countsByZone: ReadonlyMap<string, ReadonlyMap<string, SectorCounts>>,
  now: Date,
): MarketSectorsView {
  const out: ZoneSectorMovements[] = zones.map((zone) => {
    const counts = countsByZone.get(zone.codePostal);
    const sectors: SectorMovement[] = [...zone.pools.entries()].map(([code, pool]) => {
      const c = counts?.get(code) ?? { active: 0, terminated: 0 };
      return {
        code,
        label: nafLabels.get(code) ?? code,
        pool,
        active: c.active,
        terminated: c.terminated,
      };
    });
    return { codePostal: zone.codePostal, ville: zone.ville, sectors };
  });
  return { zones: out, computedAt: now.toISOString() };
}
