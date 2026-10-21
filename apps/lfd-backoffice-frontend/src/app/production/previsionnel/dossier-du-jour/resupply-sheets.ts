import type { ProductionDayResupply } from '@lfd/contracts';

/**
 * **La pile des bons de réassort** (R3d-bis) — un bon par réassort, jamais
 * fusionnés : le même rangement que le PDF du serveur
 * (`production/domain/services/day-dossier.ts`), par point puis par
 * identifiant. Un point sans nom se dit par son identifiant.
 */
export function resupplySheetsOf(
  resupplies: readonly ProductionDayResupply[],
): readonly ProductionDayResupply[] {
  return [...resupplies].sort(
    (left, right) =>
      resupplySiteLabel(left).localeCompare(resupplySiteLabel(right), 'fr') ||
      compareCodes(left.resupplyId, right.resupplyId),
  );
}

/** Le nom du point, ou son identifiant — rien d'autre n'est sûr. */
export function resupplySiteLabel(resupply: ProductionDayResupply): string {
  return resupply.siteLabel ?? resupply.siteId;
}

/** Ordre des codes, indépendant de la langue de l'hôte — comme le serveur. */
function compareCodes(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
