import type { S3StorageConfig } from "@lfd/storage";

import { clearPrefixes, type StorageResetReport } from "../../seeding/storage.seed.js";
import type { ScenarioScope } from "./scenario-scope.js";

/**
 * Les deux buckets où des pièces du scénario peuvent dormir, résolus par
 * l'appelant (seul à lire la configuration). `null` = non configuré sur ce
 * poste : ignoré, comme dans `clearSeededBuckets`.
 */
export interface ScenarioBuckets {
  readonly customers: S3StorageConfig | null;
  readonly production: S3StorageConfig | null;
}

/**
 * Ce que le scénario a laissé dans le stockage, par préfixe — relu le
 * 2026-10-05 dans `documentation/order/architecture-pieces-en-r2.md` et chez
 * les écrivains :
 *
 * - `customers` : `orders/{id}/` — les bons de commande tirés ;
 * - `production` : `orders/{id}/` (fiches d'atelier), `{jour}/` (compte à
 *   produire), les preuves de retrait de ses commandes (`handover/proofs/…`,
 *   lues sur les lignes avant leur suppression) et les photos d'incident de ses
 *   tournées (`delivery/incidents/{tournée}/`).
 *
 * Le scénario lui-même n'en écrit aucune : elles naissent quand on clique
 * « Télécharger » ou qu'on joue une remise à la porte pendant une démo.
 */
export function scenarioPrefixes(
  scope: ScenarioScope,
  extra: { readonly proofKeys: readonly string[]; readonly roundIds: readonly string[] },
): { readonly customers: readonly string[]; readonly production: readonly string[] } {
  const ofOrders = scope.orderIds.map((id) => `orders/${id}/`);
  return {
    customers: ofOrders,
    production: [
      ...ofOrders,
      ...scope.days.map((day) => `${day}/`),
      ...extra.proofKeys,
      ...extra.roundIds.map((roundId) => `delivery/incidents/${roundId}/`),
    ],
  };
}

/** Retire ces objets, bucket par bucket ; un bucket non configuré n'est pas nommé. */
export async function purgeStorage(
  buckets: ScenarioBuckets,
  prefixes: ReturnType<typeof scenarioPrefixes>,
): Promise<readonly StorageResetReport[]> {
  const reports: StorageResetReport[] = [];
  if (buckets.customers !== null) {
    reports.push(await clearPrefixes(buckets.customers, prefixes.customers));
  }
  if (buckets.production !== null) {
    reports.push(await clearPrefixes(buckets.production, prefixes.production));
  }
  return reports;
}
