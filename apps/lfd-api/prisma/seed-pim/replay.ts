import type { CommandBus } from "@nestjs/cqrs";

import { ArchiveProductCommand } from "../../src/pim/catalogue/product/application/archive-product.js";
import { CreateProductCommand } from "../../src/pim/catalogue/product/application/create-product.js";
import { DeclareProductNutritionCommand } from "../../src/pim/catalogue/product/application/declare-product-nutrition.js";
import { DeclareProductReadyCommand } from "../../src/pim/catalogue/product/application/declare-product-ready.js";
import { PublishProductCommand } from "../../src/pim/catalogue/product/application/publish-product.js";
import { SetProductChannelsCommand } from "../../src/pim/catalogue/product/application/set-product-channels.js";
import { SetProductVatCommand } from "../../src/pim/catalogue/product/application/set-product-vat.js";
import { UpdateProductEditorialCommand } from "../../src/pim/catalogue/product/application/update-product-editorial.js";
import { UpdateVariantPricingCommand } from "../../src/pim/catalogue/product/application/update-variant-pricing.js";
import type { NutritionValues } from "../../src/pim/catalogue/product/domain/value-objects/nutrition-declaration.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";
import type { CorpusNutrition, CorpusProduct } from "./corpus.js";
import { declarationFor } from "./declarations.js";
import { toContextVat, toSalesChannels, type Registry } from "./registry.js";

/**
 * Le rejeu d'une fiche — **le cycle complet, dans l'ordre où un humain le
 * parcourt** : ouvrir, tarifer, décrire, déclarer la fiche réglementaire,
 * placer sur la matrice, régler les taux, signer, mettre en vente.
 *
 * ## Aucune écriture directe
 *
 * Chaque étape est la commande que l'écran envoie. C'est tout l'intérêt : ce que
 * ce seed produit est, par construction, un état que la production peut
 * atteindre. Un `UPDATE` bien placé irait dix fois plus vite et fabriquerait des
 * fiches publiées sans allergènes — c'est-à-dire un catalogue de développement
 * qui ne ressemble à rien de réel, et des tests qui ne prouveraient rien.
 *
 * ## Ce qui est refusé n'arrête pas le rejeu
 *
 * Un refus du domaine est **compté et nommé**, pas propagé. Une fiche sans
 * déclaration refusée à la publication est un fait à rapporter, pas une panne :
 * l'arrêt priverait des 94 fiches suivantes pour une qui manque.
 */
export interface ReplayReport {
  created: number;
  updated: number;
  published: number;
  /** Fiches que ce passage a signées — celles déjà signées ne le sont pas deux fois. */
  signed: number;
  archived: number;
  /** Les fiches restées brouillon, et pourquoi — une ligne par fiche. */
  readonly refused: string[];
}

export function emptyReport(): ReplayReport {
  return { created: 0, updated: 0, published: 0, signed: 0, archived: 0, refused: [] };
}

export async function replayProducts(
  bus: CommandBus,
  prisma: PrismaService,
  products: readonly CorpusProduct[],
  registry: Registry,
): Promise<ReplayReport> {
  const report = emptyReport();
  // Les signatures déjà posées, lues UNE fois. Une fiche créée par ce passage
  // n'y est pas, par construction — inutile de la chercher.
  const alreadySigned = new Set(
    (await prisma.productReadiness.findMany({ select: { productId: true } })).map(
      (row) => row.productId,
    ),
  );
  for (const product of products) {
    try {
      await replayProduct(bus, prisma, product, registry, report, alreadySigned);
    } catch (error: unknown) {
      report.refused.push(`${product.sku} — ${describe(error)}`);
    }
  }
  return report;
}

async function replayProduct(
  bus: CommandBus,
  prisma: PrismaService,
  product: CorpusProduct,
  registry: Registry,
  report: ReplayReport,
  alreadySigned: ReadonlySet<string>,
): Promise<void> {
  const categoryId = registry.categoriesByName.get(product.categoryName);
  if (categoryId === undefined) {
    report.refused.push(`${product.sku} — famille « ${product.categoryName} » absente de la cible`);
    return;
  }
  const declaration = declarationFor(product);
  const productId = await openOrFind(bus, prisma, product, categoryId, declaration, report);

  await fillVariant(bus, prisma, productId, product, declaration);
  await describeProduct(bus, productId, product);
  await placeOnMatrix(bus, productId, product, registry);
  await settle(bus, productId, product, declaration !== null, report, alreadySigned);
}

/** Ouvre la fiche, ou retrouve celle que son SKU désigne déjà. */
async function openOrFind(
  bus: CommandBus,
  prisma: PrismaService,
  product: CorpusProduct,
  categoryId: string,
  declaration: ReturnType<typeof declarationFor>,
  report: ReplayReport,
): Promise<string> {
  const existing = await prisma.product.findUnique({ where: { sku: product.sku } });
  if (existing !== null) {
    report.updated += 1;
    return existing.id;
  }
  const id = await bus.execute<CreateProductCommand, string>(
    new CreateProductCommand({
      name: product.name,
      kind: product.kind,
      categoryId,
      sku: product.sku,
      ...(declaration === null
        ? {}
        : {
            allergens: declaration.allergens,
            mayContain: declaration.mayContain,
            nutrition: nutritionValues(declaration.nutrition),
          }),
    }),
  );
  report.created += 1;
  return id;
}

/**
 * Tarif, poids, et la fiche réglementaire si la création ne l'a pas portée —
 * c'est le cas d'une fiche qui existait déjà sans allergènes déclarés, celui-là
 * même qui bloque la publication de tout le catalogue.
 */
async function fillVariant(
  bus: CommandBus,
  prisma: PrismaService,
  productId: string,
  product: CorpusProduct,
  declaration: ReturnType<typeof declarationFor>,
): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { productId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    include: { nutrition: true },
  });
  if (variant === null) {
    return;
  }
  await bus.execute<UpdateVariantPricingCommand, void>(
    new UpdateVariantPricingCommand(productId, variant.id, {
      priceCents: product.priceCents,
      weightGrams: product.weightGrams,
    }),
  );
  if (declaration !== null && variant.nutrition === null) {
    await bus.execute<DeclareProductNutritionCommand, void>(
      new DeclareProductNutritionCommand(productId, variant.id, {
        allergens: declaration.allergens,
        mayContain: declaration.mayContain,
        nutrition: nutritionValues(declaration.nutrition),
      }),
    );
  }
}

async function describeProduct(
  bus: CommandBus,
  productId: string,
  product: CorpusProduct,
): Promise<void> {
  if (product.descriptionShort === undefined && product.descriptionLong === undefined) {
    return;
  }
  await bus.execute<UpdateProductEditorialCommand, void>(
    new UpdateProductEditorialCommand(productId, {
      ...(product.descriptionShort === undefined
        ? {}
        : { descriptionShort: product.descriptionShort }),
      ...(product.descriptionLong === undefined
        ? {}
        : { descriptionLong: product.descriptionLong }),
    }),
  );
}

/**
 * La matrice de la fiche et ses taux. `channels === null` rend la fiche à sa
 * famille — un geste, pas une absence de geste : le rejeu doit pouvoir effacer
 * une dérogation posée par un rejeu précédent.
 */
async function placeOnMatrix(
  bus: CommandBus,
  productId: string,
  product: CorpusProduct,
  registry: Registry,
): Promise<void> {
  await bus.execute<SetProductChannelsCommand, void>(
    new SetProductChannelsCommand(
      productId,
      product.channels === null ? null : toSalesChannels(product.channels, registry),
    ),
  );
  await bus.execute<SetProductVatCommand, void>(
    new SetProductVatCommand(productId, toContextVat(product.vat, registry)),
  );
}

/**
 * Le statut, en dernier — et la signature avant la mise en vente, parce que
 * c'est l'ordre du cycle : `declare-product-ready` inscrit qui affirme que la
 * fiche est juste, `publish-product` la met en vente. Les fondre ferait
 * disparaître celui des deux qui a du sens.
 *
 * ## On ne re-signe jamais
 *
 * `DeclareProductReadyCommand` n'est PAS idempotente, et elle a raison de ne
 * pas l'être : re-signer redate, et une signature qu'on redate perd la seule
 * chose qu'elle porte — depuis quand quelqu'un affirme que cette fiche est
 * juste. C'est l'argument de `B2bMembershipService.publish`, au mot près.
 *
 * L'idempotence est donc ici, dans l'appelant : le seed signe ce qui n'est pas
 * signé, et rien d'autre. Deux passages inscrivaient 190 signatures pour 95
 * fiches — un journal qui racontait deux validations là où il n'y en avait
 * qu'une.
 *
 * ⚠️ Corollaire assumé : si un passage MODIFIE une fiche déjà signée (un prix
 * changé dans `catalogue.ts`), la signature devient **périmée**, et l'écran le
 * dira. C'est le bon comportement : le seed a changé la fiche, personne ne l'a
 * revalidée. Re-signer d'office affirmerait le contraire.
 */
async function settle(
  bus: CommandBus,
  productId: string,
  product: CorpusProduct,
  declared: boolean,
  report: ReplayReport,
  alreadySigned: ReadonlySet<string>,
): Promise<void> {
  if (product.status === "archived") {
    await bus.execute<ArchiveProductCommand, void>(new ArchiveProductCommand(productId));
    report.archived += 1;
    return;
  }
  if (product.status !== "published" && !publishAllEnabled()) {
    return;
  }
  if (!declared) {
    report.refused.push(
      `${product.sku} — reste brouillon : aucune fiche réglementaire (SEED_PIM_SYNTHETIC_SHEETS=1 pour en poser une)`,
    );
    return;
  }
  if (!alreadySigned.has(productId)) {
    await bus.execute<DeclareProductReadyCommand, void>(new DeclareProductReadyCommand(productId));
    report.signed += 1;
  }
  await bus.execute<PublishProductCommand, void>(new PublishProductCommand(productId));
  report.published += 1;
}

/**
 * Mettre en vente **tout ce qui peut l'être**, au lieu de suivre le statut du
 * corpus.
 *
 * Le besoin est réel et étroit : une base source dont tout le catalogue est en
 * brouillon rejoue un catalogue en brouillon, donc un miroir B2B vide, donc rien
 * sur quoi développer côté commerce. Le drapeau dit « je veux un catalogue en
 * vente », et il reste un choix — le rejeu fidèle est le défaut, parce que c'est
 * lui qui reproduit la source.
 *
 * Il ne contourne aucun refus : `publish()` juge, comme toujours. Une fiche sans
 * déclaration reste brouillon avec ce drapeau comme sans lui.
 */
function publishAllEnabled(): boolean {
  return process.env["SEED_PIM_PUBLISH_ALL"] === "1";
}

/**
 * `null` (le corpus, qui vient d'une colonne) et `undefined` (le value object,
 * qui vient d'un formulaire) disent la même chose — « non renseigné » — mais ne
 * s'écrivent pas pareil. La conversion vit ici, une fois : une clé posée à
 * `undefined` sous `exactOptionalPropertyTypes` n'est PAS une clé absente, et
 * la fabrique du domaine compte les champs renseignés.
 */
function nutritionValues(nutrition: CorpusNutrition): NutritionValues {
  const values: Record<string, number> = {};
  for (const [field, value] of Object.entries(nutrition)) {
    if (typeof value === "number") {
      values[field] = value;
    }
  }
  return values;
}

/** Un refus du domaine porte son message ; le reste n'a que sa forme. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
