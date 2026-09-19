import type { OrderTimeLimitScopeType } from "@lfd/pim-contracts";

import type { PrismaService } from "../../../platform/database/prisma.service.js";

/** Une portée telle que la table la range : le type en chaîne, la cible ou rien. */
export interface ScopeTarget {
  readonly scopeType: string;
  readonly scopeId: string | null;
}

/**
 * Les noms des cibles visées, par identifiant — une famille par son nom, un
 * produit ou une déclinaison par son SKU.
 *
 * Trois lectures plutôt qu'une jointure : les cibles vivent dans trois tables
 * différentes et Prisma n'a pas de relation polymorphe. Partagé par la liste
 * des règles (l'écran) et par le nom qu'un fait fige au journal
 * (`PrismaLimitScopeNamer`) : les deux disent la même cible avec les mêmes mots.
 */
export async function targetLabels(
  prisma: PrismaService,
  targets: readonly ScopeTarget[],
): Promise<ReadonlyMap<string, string>> {
  const idsOf = (type: OrderTimeLimitScopeType): string[] =>
    targets.flatMap((row) => (row.scopeType === type && row.scopeId !== null ? [row.scopeId] : []));

  const [categories, products, variants] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: idsOf("category") } } }),
    prisma.product.findMany({
      where: { id: { in: idsOf("product") } },
      select: { id: true, sku: true },
    }),
    prisma.productVariant.findMany({
      where: { id: { in: idsOf("variant") } },
      select: { id: true, sku: true },
    }),
  ]);

  const labels = new Map<string, string>();
  for (const category of categories) {
    labels.set(category.id, readName(category.name));
  }
  for (const product of products) {
    labels.set(product.id, product.sku);
  }
  for (const variant of variants) {
    labels.set(variant.id, variant.sku);
  }
  return labels;
}

/**
 * Le nom localisé d'une famille, réduit à quelque chose d'affichable.
 *
 * La colonne est un `jsonb` : on la **lit défensivement** plutôt que de la
 * caster. Une valeur écrite à la main ne doit pas faire tomber l'écran de
 * réglages — elle doit juste ne pas avoir de nom.
 */
function readName(value: unknown): string {
  if (typeof value === "object" && value !== null && "fr" in value) {
    const french: unknown = Reflect.get(value, "fr");
    return typeof french === "string" ? french : "";
  }
  return "";
}
