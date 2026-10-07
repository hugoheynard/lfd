import { legacyRoleSeeds } from "@lfd/contracts";

import type { PrismaClient } from "../../platform/database/client/client.js";

/** Ce que la remise des rôles a fait, pour le compte rendu. */
export interface RolesSeedReport {
  /** Les rôles du code absents de la base, créés depuis la graine. */
  readonly created: readonly string[];
  /** Les rôles du code présents, réécrits sur la graine — libellé et droits. */
  readonly rewritten: readonly string[];
  /** Les rôles créés à l'écran, hors du code : laissés tels quels. */
  readonly untouched: readonly string[];
}

/**
 * **Remet les rôles du code sur leur graine** (`ROLE_GRANTS`, par
 * `legacyRoleSeeds`) : chaque rôle de `staffRoleSchema` est créé s'il manque,
 * réécrit s'il existe. Un rôle créé à l'écran n'est pas touché, ni aucune
 * dérogation par personne (`staff_permission_overrides`).
 *
 * Partagé par le harnais e2e, qui l'appelle après chaque remise à zéro, et par
 * `db:seed:roles`, qu'on lance À LA MAIN sur une base de dev (audit livraisons
 * Q4, Hugo, 2026-10-07 : une commande explicite, jamais un semis qui
 * écraserait en silence ce qu'on a réglé à l'écran). Ce n'est pas une
 * migration : rien ne l'appelle en production.
 */
export async function resetRolesToSeed(prisma: PrismaClient): Promise<RolesSeedReport> {
  const seeds = legacyRoleSeeds();
  const existing = await prisma.staffRoleDefinition.findMany({ select: { key: true } });
  const present = new Set(existing.map((row) => row.key));
  const seeded = new Set<string>(seeds.map((seed) => seed.key));
  for (const seed of seeds) {
    await prisma.staffRoleDefinition.upsert({
      where: { key: seed.key },
      create: { key: seed.key, label: seed.label, grants: [...seed.grants] },
      update: { label: seed.label, grants: [...seed.grants] },
    });
  }
  return {
    created: seeds.filter((seed) => !present.has(seed.key)).map((seed) => seed.key),
    rewritten: seeds.filter((seed) => present.has(seed.key)).map((seed) => seed.key),
    untouched: [...present].filter((key) => !seeded.has(key)).sort(),
  };
}
