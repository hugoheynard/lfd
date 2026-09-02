import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PimFacts } from "../domain/entities/catalog-item.js";
import { CatalogVersion } from "../domain/entities/catalog-version.js";
import { CatalogVersionReader } from "../domain/ports/catalog-version.reader.js";
import { CatalogVersionRepository } from "../domain/ports/catalog-version.repository.js";

/**
 * La forme des faits archivés.
 *
 * ⚠️ **Règle d'évolution, et elle compte plus que le schéma lui-même** : tout
 * champ ajouté à {@link PimFacts} entre ici en `.optional()` avec un défaut, et
 * jamais en requis. Une version est une archive **immuable et perpétuelle** —
 * une ligne écrite l'an dernier ne peut pas gagner rétroactivement un champ, et
 * un schéma qui l'exigerait rendrait l'archive illisible le jour où on en a le
 * plus besoin. C'est la différence avec le snapshot d'une arrivée, qui vit une
 * journée et qu'on a raison de revalider strictement.
 */
const archivedFactsSchema = z.object({
  sku: z.string(),
  productId: z.string(),
  productSku: z.string(),
  name: z.string(),
  kind: z.string(),
  categoryId: z.string(),
  priceMillicents: z.number().int(),
  weightGrams: z.number().int().nullable(),
  isDefault: z.boolean(),
  position: z.number().int(),
  vatRatePercent: z.number().nullable(),
  allergens: z.array(z.string()).nullable(),
  allergenLabels: z
    .object({
      labels: z.array(z.object({ category: z.string(), label: z.string() })),
      incomplete: z.boolean(),
    })
    .nullable(),
  // Écrit en ISO dans le `jsonb` : `Date` n'est pas une valeur JSON, et la
  // conversion doit être explicite plutôt que subie du sérialiseur.
  receivedAt: z.coerce.date(),
});

const archivedLinesSchema = z.array(archivedFactsSchema);
const excludedSkusSchema = z.array(z.string());

/** La ligne telle que Prisma la rend. Aucun type `Prisma.*` ne sort d'ici. */
interface VersionRow {
  readonly id: string;
  readonly deliveryId: string;
  readonly revisionId: string;
  readonly fingerprint: string;
  readonly excludedSkus: unknown;
  readonly items: unknown;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

function toDomain(row: VersionRow): CatalogVersion {
  return CatalogVersion.reconstitute({
    id: row.id,
    deliveryId: row.deliveryId,
    revisionId: row.revisionId,
    fingerprint: row.fingerprint,
    excludedSkus: excludedSkusSchema.parse(row.excludedSkus),
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    lines: archivedLinesSchema.parse(row.items),
  });
}

/** Les faits, prêts pour le `jsonb` — la date en ISO, le reste tel quel. */
function toJson(facts: PimFacts): Prisma.InputJsonObject {
  return {
    sku: facts.sku,
    productId: facts.productId,
    productSku: facts.productSku,
    name: facts.name,
    kind: facts.kind,
    categoryId: facts.categoryId,
    priceMillicents: facts.priceMillicents,
    weightGrams: facts.weightGrams,
    isDefault: facts.isDefault,
    position: facts.position,
    vatRatePercent: facts.vatRatePercent,
    allergens: facts.allergens === null ? null : [...facts.allergens],
    allergenLabels:
      facts.allergenLabels === null
        ? null
        : {
            labels: facts.allergenLabels.labels.map((entry) => ({ ...entry })),
            incomplete: facts.allergenLabels.incomplete,
          },
    receivedAt: facts.receivedAt.toISOString(),
  };
}

@Injectable()
export class PrismaCatalogVersionRepository extends CatalogVersionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `create` et non `upsert` : réécrire une version existante est exactement ce
   * qu'une archive ne doit pas permettre. Un identifiant déjà pris lève, et
   * c'est la réponse voulue.
   */
  async append(version: CatalogVersion): Promise<void> {
    const state = version.toPersistence();
    await this.prisma.catalogVersion.create({
      data: {
        id: state.id,
        deliveryId: state.deliveryId,
        revisionId: state.revisionId,
        fingerprint: state.fingerprint,
        excludedSkus: [...state.excludedSkus],
        items: state.lines.map(toJson),
        // Redondant avec `items`, et assumé : lister les versions sans
        // désérialiser cent kilo-octets par ligne.
        itemCount: state.lines.length,
        createdAt: state.createdAt,
        createdBy: state.createdBy,
      },
    });
  }
}

@Injectable()
export class PrismaCatalogVersionReader extends CatalogVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Trié sur `createdAt`, l'index qui existe. Deux versions ne peuvent pas
   * partager une milliseconde en pratique — une validation est un geste humain
   * — et l'identifiant ULID départagerait de toute façon dans le même ordre.
   */
  async currentId(): Promise<string | null> {
    const row = await this.prisma.catalogVersion.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async byId(id: string): Promise<CatalogVersion | null> {
    const row = await this.prisma.catalogVersion.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }
}
