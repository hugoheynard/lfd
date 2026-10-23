import { pickupSnapshotSchema } from "@lfd/contracts";

/**
 * **Le site figé dans le snapshot du point de retrait** (lot S2,
 * `documentation/sites/sites.md` §7), ou `null`.
 *
 * `null` couvre trois cas, que tout lecteur traite pareil : une livraison
 * (pas de snapshot), une commande passée avant le lot que la migration
 * `20261023200000_les_retraits_d_avant_s2_rattaches` n'a pas rattachée
 * (vivante ou ambiguë — Q-S2 révisée le 2026-10-23), et un JSON d'une autre
 * forme. Le marqueur `siteIdBackfilled` est ignoré ici. Validé
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

/**
 * Le nom du point de retrait figé dans le snapshot, ou `null` (livraison,
 * snapshot illisible, nom vide). Validé plutôt que casté, comme le site.
 */
export function pickupLabelOf(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = pickupSnapshotSchema.safeParse(value);
  return parsed.success && parsed.data.label !== "" ? parsed.data.label : null;
}
