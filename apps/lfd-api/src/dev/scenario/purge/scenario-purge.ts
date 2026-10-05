import type { DevScenarioPurgeCategory } from "@lfd/contracts";

import type { PrismaClient } from "../../../platform/database/client/client.js";
import type { StorageResetReport } from "../../seeding/storage.seed.js";
import { purgeCommerce } from "./commerce.purge.js";
import { purgeDelivery } from "./delivery.purge.js";
import { purgeJournals } from "./journals.purge.js";
import { purgeOutbox } from "./outbox.purge.js";
import { purgePacking } from "./packing.purge.js";
import { purgeProduction } from "./production.purge.js";
import { PURGE_TRANSACTION_TIMEOUT_MS, type ScenarioScope } from "./scenario-scope.js";
import { purgeStorage, scenarioPrefixes, type ScenarioBuckets } from "./storage.purge.js";

/** Ce que la purge a emporté, par catégorie — lignes et objets. */
export interface ScenarioPurgeReport {
  readonly removed: readonly {
    readonly category: DevScenarioPurgeCategory;
    readonly rows: number;
  }[];
  /** Les commandes, comptées à part : c'est le chiffre qu'on lit d'abord. */
  readonly orders: number;
  readonly storage: readonly StorageResetReport[];
}

/**
 * ⚠️ **Supprime ce que le scénario a créé** — et seulement cela : ses journées,
 * ses clients (`ScenarioScope`). Destructif, et c'est tout ce qu'il fait.
 *
 * Il **supprime** plutôt que de recouvrir (plan §2 bis, Hugo, 2026-10-05) :
 * un bouton qu'on presse vingt fois par démo ne doit faire grossir ni la base
 * ni le stockage. Le même jour, deux suites e2e simultanées avaient rempli le
 * disque de la VM Docker et fait tomber Postgres local.
 *
 * **Une transaction par domaine**, pas une écriture par ligne : chaque domaine
 * part d'un bloc, sans gonfler `pg_wal` d'une transaction par ligne. Les
 * domaines ne se tiennent par aucune clé (la frontière le veut), donc leur
 * ordre est libre ; la livraison passe d'abord parce qu'elle rend les
 * tournées dont les journaux et les photos ont besoin.
 *
 * Pas de serrure ici : ses appelants refusent déjà toute cible non locale
 * (`refuseUnlessLocalDevelopment`, `refuseNonLocalTarget`), et la serrure du
 * stockage vit au plus bas (`storage.seed.ts`).
 */
export async function purgeScenario(
  prisma: PrismaClient,
  scope: ScenarioScope,
  buckets: ScenarioBuckets,
): Promise<ScenarioPurgeReport> {
  const options = { timeout: PURGE_TRANSACTION_TIMEOUT_MS };
  const delivery = await prisma.$transaction((tx) => purgeDelivery(tx, scope), options);
  const packing = await prisma.$transaction((tx) => purgePacking(tx, scope), options);
  const production = await prisma.$transaction((tx) => purgeProduction(tx, scope), options);
  const outbox = await prisma.$transaction((tx) => purgeOutbox(tx, scope), options);
  const commerce = await prisma.$transaction((tx) => purgeCommerce(tx, scope), options);
  const journals = await prisma.$transaction(
    (tx) => purgeJournals(tx, scope, delivery.roundIds),
    options,
  );
  const storage = await purgeStorage(
    buckets,
    scenarioPrefixes(scope, { proofKeys: production.proofKeys, roundIds: delivery.roundIds }),
  );
  return {
    removed: [
      { category: "orders", rows: commerce.rows },
      { category: "production", rows: production.rows },
      { category: "packing", rows: packing },
      { category: "delivery", rows: delivery.rows },
      { category: "outbox", rows: outbox },
      { category: "journals", rows: journals },
    ],
    orders: commerce.orders,
    storage,
  };
}
