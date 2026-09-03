import { Injectable } from "@nestjs/common";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SkuAlreadyUsedError } from "../domain/errors/sku-errors.js";
import { Product, type ProductSnapshot } from "../domain/entities/product.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import {
  ProductRepository,
  type ProductKind,
  type ProductStatus,
} from "../domain/ports/product.repository.js";
import {
  isUniqueViolation,
  localizedColumn,
  readLocalizedColumn,
  readStringArrayColumn,
  readStringMapColumn,
} from "../../shared/infrastructure/json-readers.js";
import { normalizeSalesChannels } from "../../shared/domain/value-objects/sales-channels.js";

interface NutritionRow {
  allergens: unknown;
  mayContain: unknown;
  energyKcal: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbsG: number | null;
  sugarsG: number | null;
  proteinG: number | null;
  saltG: number | null;
  glycemicIndex: number | null;
}

interface VariantRow {
  id: string;
  sku: string;
  name: unknown;
  options: unknown;
  isDefault: boolean;
  isDiscontinued: boolean;
  position: number;
  priceCents: number | null;
  weightGrams: number | null;
  regulatoryFollowsDefault: boolean;
  nutrition: NutritionRow | null;
}

interface ProductRow {
  id: string;
  sku: string;
  name: unknown;
  slug: unknown;
  kind: ProductKind;
  categoryId: string;
  status: ProductStatus;
  variants: VariantRow[];
  contextVat: readonly { vatRateId: string; context: { key: string } }[];
  channelOverrideRows: {
    readonly cells: readonly { pointOfSaleId: string; contextKey: string }[];
  } | null;
}

/**
 * Les dérogations voyagent AVEC le produit : elles sont à lui.
 *
 * Celle des canaux est une **ligne parente plus ses cellules**, et non une
 * colonne : c'est ce qui distingue « déroge et ne vend nulle part » (parente
 * présente, zéro cellule) de « hérite de sa famille » (pas de parente).
 */
const PRODUCT_INCLUDE = {
  variants: { orderBy: { position: "asc" }, include: { nutrition: true } },
  contextVat: { select: { vatRateId: true, context: { select: { key: true } } } },
  channelOverrideRows: { select: { cells: { select: { pointOfSaleId: true, contextKey: true } } } },
} as const;

function toVariant(row: VariantRow): VariantSnapshot {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "variant.name"),
    options: readStringMapColumn(row.options, "variant.options"),
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    position: row.position,
    priceCents: row.priceCents,
    weightGrams: row.weightGrams,
    regulatoryFollowsDefault: row.regulatoryFollowsDefault,
    allergens:
      row.nutrition === null
        ? null
        : readStringArrayColumn(row.nutrition.allergens, "nutrition.allergens"),
    nutrition:
      row.nutrition === null
        ? null
        : {
            mayContain: readStringArrayColumn(row.nutrition.mayContain, "nutrition.mayContain"),
            energyKcal: row.nutrition.energyKcal,
            fatG: row.nutrition.fatG,
            saturatedFatG: row.nutrition.saturatedFatG,
            carbsG: row.nutrition.carbsG,
            sugarsG: row.nutrition.sugarsG,
            proteinG: row.nutrition.proteinG,
            saltG: row.nutrition.saltG,
            glycemicIndex: row.nutrition.glycemicIndex,
          },
  };
}

function toProduct(row: ProductRow): Product {
  return Product.reconstitute({
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "product.name"),
    slug: readLocalizedColumn(row.slug, "product.slug"),
    kind: row.kind,
    categoryId: row.categoryId,
    status: row.status,
    variants: row.variants.map(toVariant),
    vatByContext: Object.fromEntries(
      row.contextVat.map((line) => [line.context.key, line.vatRateId]),
    ),
    // L'ABSENCE de ligne parente est « la fiche hérite » ; une parente sans
    // cellule est « elle déroge, et ne vend nulle part ». Les deux se lisent.
    channelOverride:
      row.channelOverrideRows === null
        ? null
        : normalizeSalesChannels(
            row.channelOverrideRows.cells.map((cell) => ({
              pointOfSaleId: cell.pointOfSaleId,
              context: cell.contextKey,
            })),
          ),
  });
}

/** Les colonnes du produit lui-même — les déclinaisons ont les leurs. */
/**
 * QUI a écrit — la colonne système d'ADR-11, enfin remplie.
 *
 * Ici, dans l'infrastructure, et non dans un handler : c'est le seul endroit
 * qu'aucune écriture ne peut contourner. Un handler qui devrait y penser est un
 * handler qui peut l'oublier, et une colonne remplie une fois sur deux est pire
 * que vide — on la croit.
 *
 * `null` hors requête (un seed, un cron) : c'est exactement ce qui est vrai, et
 * l'inventer serait pire que l'avouer.
 */
function writtenBy(): string | null {
  return currentRequestContext()?.actor.id ?? null;
}

function toColumns(snapshot: ProductSnapshot) {
  return {
    updatedBy: writtenBy(),
    name: localizedColumn(snapshot.name),
    slug: localizedColumn(snapshot.slug),
    kind: snapshot.kind,
    categoryId: snapshot.categoryId,
    status: snapshot.status,
  };
}

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    return row === null ? null : toProduct(row);
  }

  async listAll(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({
      include: PRODUCT_INCLUDE,
      orderBy: { sku: "asc" },
    });
    return rows.map(toProduct);
  }

  /**
   * Produit + déclinaison par défaut + réservation des deux références, **en une
   * transaction**. L'invariant « au moins une déclinaison, exactement une par défaut »
   * n'est ainsi jamais faux, même une fraction de seconde.
   *
   * C'est ici — et nulle part ailleurs — que la violation d'unicité Postgres est traduite
   * en erreur métier : ni le handler ni le contrôleur ne connaissent le code `P2002`.
   */
  async add(product: Product): Promise<void> {
    const snapshot = product.snapshot();
    const [defaultVariant] = snapshot.variants;
    if (defaultVariant === undefined) {
      // Inatteignable : l'agrégat refuse de naître sans déclinaison par défaut.
      throw new Error("produit sans déclinaison — invariant 2 violé avant écriture");
    }

    try {
      await this.prisma.$transaction([
        this.prisma.skuRegistry.create({
          data: { value: snapshot.sku, ownerType: "product", ownerId: snapshot.id },
        }),
        this.prisma.skuRegistry.create({
          data: { value: defaultVariant.sku, ownerType: "variant", ownerId: defaultVariant.id },
        }),
        this.prisma.product.create({
          data: {
            id: snapshot.id,
            sku: snapshot.sku,
            ...toColumns(snapshot),
            variants: {
              create: {
                id: defaultVariant.id,
                sku: defaultVariant.sku,
                name: localizedColumn(defaultVariant.name),
                isDefault: defaultVariant.isDefault,
                position: defaultVariant.position,
              },
            },
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SkuAlreadyUsedError(snapshot.sku);
      }
      throw error;
    }
  }

  /**
   * Écrit le produit ET ses déclinaisons, en une transaction. On réécrit
   * toutes les déclinaisons plutôt que de deviner celles qui ont bougé : un
   * agrégat en porte une poignée, et « deviner » est précisément ce que
   * l'ancien port faisait — une méthode par mutation, à tenir d'accord avec
   * le domaine à la main.
   */
  async save(product: Product): Promise<void> {
    const snapshot = product.snapshot();
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
      // Les dérogations se REMPLACENT d'un bloc : un `upsert` par contexte
      // laisserait vivre la ligne d'un contexte qu'on vient de rendre à sa
      // famille, et « je reviens à l'héritage » ressemblerait à « rien changé ».
      this.prisma.productContextVat.deleteMany({ where: { productId: snapshot.id } }),
      ...Object.entries(snapshot.vatByContext).map(([contextKey, vatRateId]) =>
        this.prisma.productContextVat.create({
          data: {
            product: { connect: { id: snapshot.id } },
            context: { connect: { key: contextKey } },
            vatRate: { connect: { id: vatRateId } },
          },
        }),
      ),
      ...this.overrideOperations(snapshot),
      // `upsert` et non `update` : une déclinaison AJOUTÉE par ce passage
      // n'existe pas encore en base, et un `update` échouerait sur elle. La
      // réservation de sa référence part avec, dans la même transaction — sans
      // quoi un SKU vivrait sur une déclinaison que le registre ignore, et le
      // prochain tirage pourrait le proposer à une autre.
      ...snapshot.variants.map((variant) =>
        this.prisma.skuRegistry.upsert({
          where: { value: variant.sku },
          create: { value: variant.sku, ownerType: "variant", ownerId: variant.id },
          update: {},
        }),
      ),
      ...snapshot.variants.map((variant) =>
        this.prisma.productVariant.upsert({
          where: { id: variant.id },
          create: {
            id: variant.id,
            productId: snapshot.id,
            sku: variant.sku,
            name: localizedColumn(variant.name),
            options: { ...variant.options },
            isDefault: variant.isDefault,
            isDiscontinued: variant.isDiscontinued,
            position: variant.position,
            priceCents: variant.priceCents,
            weightGrams: variant.weightGrams,
            regulatoryFollowsDefault: variant.regulatoryFollowsDefault,
          },
          update: {
            name: localizedColumn(variant.name),
            isDefault: variant.isDefault,
            isDiscontinued: variant.isDiscontinued,
            position: variant.position,
            priceCents: variant.priceCents,
            weightGrams: variant.weightGrams,
            regulatoryFollowsDefault: variant.regulatoryFollowsDefault,
          },
        }),
      ),
    ]);
  }

  /**
   * Écrit la dérogation de canaux **en table** — la forme cible (C0-d, d-1).
   *
   * La ligne parente porte l'EXISTENCE de la dérogation, ses cellules ce
   * qu'elle contient. C'est ce qui distingue « déroge et ne vend nulle part »
   * de « hérite de sa famille » : sans elle, les deux seraient zéro ligne, donc
   * indistinguables.
   *
   * Le `deleteMany` sur la parente emporte les cellules par cascade — rien à
   * nettoyer avant de réécrire, et surtout aucune cellule ne peut survivre à la
   * dérogation qui la portait.
   *
   * `point_of_sale_id` est la seule colonne de lieu depuis p-3.
   */
  private overrideOperations(snapshot: ProductSnapshot) {
    const remove = this.prisma.productChannelOverride.deleteMany({
      where: { productId: snapshot.id },
    });
    if (snapshot.channelOverride === null) {
      return [remove];
    }
    const sold = snapshot.channelOverride;
    return [
      remove,
      this.prisma.productChannelOverride.create({ data: { productId: snapshot.id } }),
      ...(sold.length === 0
        ? []
        : [
            this.prisma.productChannel.createMany({
              data: sold.map((channel) => ({
                productId: snapshot.id,
                pointOfSaleId: channel.pointOfSaleId,
                contextKey: channel.context,
              })),
            }),
          ]),
    ];
  }
}
