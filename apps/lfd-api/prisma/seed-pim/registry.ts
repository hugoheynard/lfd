import type { CommandBus } from "@nestjs/cqrs";

import { CreateCategoryCommand } from "../../src/pim/catalogue/category/application/create-category.js";
import { SetCategoryChannelsCommand } from "../../src/pim/catalogue/category/application/set-category-channels.js";
import { SetCategoryVatCommand } from "../../src/pim/catalogue/category/application/set-category-vat.js";
import { OpenPointOfSaleCommand } from "../../src/pim/points-of-sale/application/open-point-of-sale.js";
import { CreateSalesContextCommand } from "../../src/pim/sales-contexts/application/create-sales-context.js";
import { SetProPriceRatioCommand } from "../../src/pim/accounting-rules/application/set-pro-price-ratio.js";
import { CreateVatRateCommand } from "../../src/pim/vat-rates/application/create-vat-rate.js";
import type { SalesChannels } from "../../src/pim/catalogue/shared/domain/value-objects/sales-channels.js";
import type { ContextVat } from "../../src/pim/catalogue/shared/domain/value-objects/context-vat.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";
import type { CatalogueCorpus, CorpusChannel } from "./corpus.js";

/**
 * Le **référentiel transverse** — contextes de vente, points de vente, taux,
 * familles — posé avant la première fiche, et la table de correspondance qui
 * traduit les clés portables du corpus en identifiants de la base cible.
 *
 * ## Pourquoi une table de correspondance plutôt que des identifiants recopiés
 *
 * Chaque création passe par sa commande, donc par `PimIdGenerator` : les ULID
 * de la cible ne sont **pas** ceux de la source, et ils ne peuvent pas l'être
 * sans court-circuiter le générateur. Le corpus désigne donc par nom, et c'est
 * ici qu'on rattache. Le prix à payer est visible : un point de vente renommé
 * dans la source produit un second point de vente à la cible. C'est le bon
 * arbitrage — un doublon se voit, un identifiant frappé à la main ne se voit pas.
 *
 * ## Idempotence
 *
 * Chaque phase cherche avant de créer. Les lectures passent par Prisma, pas par
 * une query : on cherche « existe-t-il déjà », pas un cas d'usage métier, et
 * inventer une query par entité pour un script de seed déplacerait la
 * complexité sans rien tenir de plus.
 */
export interface Registry {
  readonly pointsByLabel: ReadonlyMap<string, string>;
  readonly ratesByName: ReadonlyMap<string, string>;
  readonly categoriesByName: ReadonlyMap<string, string>;
  readonly contextKeys: ReadonlySet<string>;
}

export interface RegistryCounts {
  readonly contextsCreated: number;
  readonly pointsCreated: number;
  readonly ratesCreated: number;
  readonly categoriesCreated: number;
}

export interface RegistryResult {
  readonly registry: Registry;
  readonly counts: RegistryCounts;
}

export async function seedRegistry(
  bus: CommandBus,
  prisma: PrismaService,
  corpus: CatalogueCorpus,
): Promise<RegistryResult> {
  // En premier : sans lui, la projection du miroir B2B refuse de tarifer, donc
  // tout le reste ne produit rien de visible côté commerce.
  await bus.execute<SetProPriceRatioCommand, void>(
    new SetProPriceRatioCommand(corpus.proPriceRatioBp),
  );
  const contextsCreated = await seedContexts(bus, prisma, corpus);
  const pointsCreated = await seedPointsOfSale(bus, prisma, corpus);
  const ratesCreated = await seedVatRates(bus, prisma, corpus);

  const registry = await snapshot(prisma);
  const categoriesCreated = await seedCategories(bus, corpus, registry);

  return {
    registry: await snapshot(prisma),
    counts: { contextsCreated, pointsCreated, ratesCreated, categoriesCreated },
  };
}

async function seedContexts(
  bus: CommandBus,
  prisma: PrismaService,
  corpus: CatalogueCorpus,
): Promise<number> {
  const existing = new Set((await prisma.salesContext.findMany()).map((row) => row.key));
  let created = 0;
  for (const context of corpus.salesContexts) {
    if (existing.has(context.key)) {
      continue;
    }
    await bus.execute<CreateSalesContextCommand, string>(
      new CreateSalesContextCommand({
        key: context.key,
        label: context.label,
        handleSuffix: context.handleSuffix,
        active: context.active,
        shopifyProjected: context.shopifyProjected,
      }),
    );
    created += 1;
  }
  return created;
}

async function seedPointsOfSale(
  bus: CommandBus,
  prisma: PrismaService,
  corpus: CatalogueCorpus,
): Promise<number> {
  const existing = new Set((await prisma.pointOfSale.findMany()).map((row) => row.label));
  let created = 0;
  for (const point of corpus.pointsOfSale) {
    if (existing.has(point.label)) {
      continue;
    }
    await bus.execute<OpenPointOfSaleCommand, string>(
      new OpenPointOfSaleCommand({
        kind: point.kind,
        label: point.label,
        baseUrl: point.baseUrl,
        contexts: [...point.contexts],
        tableCount: point.tableCount,
      }),
    );
    created += 1;
  }
  return created;
}

/**
 * `percent` est unique en base : deux taux au même pourcentage sont refusés par
 * la contrainte, pas par le domaine. On cherche donc sur les DEUX clés — le nom
 * (ce que le corpus désigne) et le pourcentage (ce que la base impose).
 */
async function seedVatRates(
  bus: CommandBus,
  prisma: PrismaService,
  corpus: CatalogueCorpus,
): Promise<number> {
  const rows = await prisma.vatRate.findMany();
  const names = new Set(rows.map((row) => row.name));
  const percents = new Set(rows.map((row) => row.percent));
  let created = 0;
  for (const rate of corpus.vatRates) {
    if (names.has(rate.name) || percents.has(rate.percent)) {
      continue;
    }
    await bus.execute<CreateVatRateCommand, string>(
      new CreateVatRateCommand({
        name: rate.name,
        description: rate.description,
        percent: rate.percent,
      }),
    );
    created += 1;
  }
  return created;
}

/**
 * Les familles se créent **par vagues de profondeur** : une famille cite son
 * parent par nom, et le parent doit exister avant l'enfant. Une seule passe
 * suffirait si le corpus était trié ; le tri est une propriété de l'extraction,
 * donc une hypothèse — la boucle, elle, ne repose sur rien.
 */
async function seedCategories(
  bus: CommandBus,
  corpus: CatalogueCorpus,
  registry: Registry,
): Promise<number> {
  const known = new Map(registry.categoriesByName);
  const pending = corpus.categories.filter((category) => !known.has(category.name.fr));
  let created = 0;

  while (pending.length > 0) {
    const ready = pending.filter(
      (category) => category.parentName === null || known.has(category.parentName),
    );
    if (ready.length === 0) {
      const orphans = pending.map((category) => category.name.fr).join(", ");
      throw new Error(`Familles dont le parent est introuvable : ${orphans}`);
    }
    for (const category of ready) {
      const parentId = category.parentName === null ? undefined : known.get(category.parentName);
      const id = await bus.execute<CreateCategoryCommand, string>(
        new CreateCategoryCommand({
          name: category.name,
          ...(parentId === undefined ? {} : { parentId }),
        }),
      );
      known.set(category.name.fr, id);
      pending.splice(pending.indexOf(category), 1);
      created += 1;
    }
  }

  await applyCategoryMatrices(bus, corpus, { ...registry, categoriesByName: known });
  return created;
}

/**
 * La matrice des familles est posée **après** que toutes existent : elle cite
 * des points de vente et des contextes, et l'ordre de création des familles ne
 * doit pas décider de ce qu'une famille vend.
 */
async function applyCategoryMatrices(
  bus: CommandBus,
  corpus: CatalogueCorpus,
  registry: Registry,
): Promise<void> {
  for (const category of corpus.categories) {
    const id = registry.categoriesByName.get(category.name.fr);
    if (id === undefined) {
      continue;
    }
    await bus.execute<SetCategoryChannelsCommand, void>(
      new SetCategoryChannelsCommand(id, toSalesChannels(category.channels, registry)),
    );
    const vat = toContextVat(category.vat, registry);
    if (Object.keys(vat).length > 0) {
      await bus.execute<SetCategoryVatCommand, void>(new SetCategoryVatCommand(id, vat));
    }
  }
}

/**
 * Une case dont le point de vente ou le contexte est inconnu de la cible est
 * **écartée**, pas devinée. Elle ferait échouer la commande à la première
 * vérification, et le seed s'arrêterait sur une famille au lieu de rejouer le
 * reste — or un référentiel partiel se complète, il ne se bloque pas.
 */
export function toSalesChannels(
  channels: readonly CorpusChannel[],
  registry: Registry,
): SalesChannels {
  return channels.flatMap((cell) => {
    const pointOfSaleId = registry.pointsByLabel.get(cell.pointOfSaleLabel);
    if (pointOfSaleId === undefined || !registry.contextKeys.has(cell.context)) {
      return [];
    }
    return [{ pointOfSaleId, context: cell.context }];
  });
}

/** Même règle : un taux dont le nom est inconnu ne se remplace pas par un voisin. */
export function toContextVat(
  vat: Readonly<Record<string, string>>,
  registry: Registry,
): ContextVat {
  const resolved: Record<string, string> = {};
  for (const [contextKey, rateName] of Object.entries(vat)) {
    const rateId = registry.ratesByName.get(rateName);
    if (rateId !== undefined && registry.contextKeys.has(contextKey)) {
      resolved[contextKey] = rateId;
    }
  }
  return resolved;
}

async function snapshot(prisma: PrismaService): Promise<Registry> {
  const [points, rates, categories, contexts] = await Promise.all([
    prisma.pointOfSale.findMany(),
    prisma.vatRate.findMany(),
    prisma.category.findMany({ where: { isArchived: false } }),
    prisma.salesContext.findMany(),
  ]);
  return {
    pointsByLabel: new Map(points.map((row) => [row.label, row.id])),
    ratesByName: new Map(rates.map((row) => [row.name, row.id])),
    categoriesByName: new Map(
      categories.flatMap((row) => {
        const name = readFrench(row.name);
        return name === null ? [] : [[name, row.id] as const];
      }),
    ),
    contextKeys: new Set(contexts.map((row) => row.key)),
  };
}

/** Le nom source d'une famille, lu dans sa colonne `Json`. */
function readFrench(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record: Record<string, unknown> = { ...value };
  const source = record["fr"];
  return typeof source === "string" && source.trim() !== "" ? source : null;
}
