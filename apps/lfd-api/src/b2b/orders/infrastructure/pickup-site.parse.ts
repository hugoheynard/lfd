import { pickupSnapshotSchema } from "@lfd/contracts";

/**
 * **Le site figé dans le snapshot du point de retrait** (lot S2,
 * `documentation/sites/sites.md` §7), ou `null`.
 *
 * `null` couvre trois cas, que tout lecteur traite pareil : une livraison
 * (pas de snapshot), une commande passée avant le lot (snapshot sans
 * `siteId`, jamais rattrapé — Q-S2), et un JSON d'une autre forme. Validé
 * plutôt que casté, comme le libellé : une forme illisible ne doit pas
 * remonter en clé d'onglet ni en échéance.
 */
export function siteIdOf(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = pickupSnapshotSchema.safeParse(value);
  return parsed.success ? (parsed.data.siteId ?? null) : null;
}
