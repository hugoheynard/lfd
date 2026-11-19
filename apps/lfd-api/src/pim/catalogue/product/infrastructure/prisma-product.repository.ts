import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductWithoutVariantError } from "../domain/errors/product-invariant-errors.js";
import { SkuAlreadyUsedError } from "../domain/errors/sku-errors.js";
import type { Product, ProductSnapshot } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { isUniqueViolation, localizedColumn } from "../../../shared/json-readers.js";
import { productColumns, variantCreateColumns, variantUpdateColumns } from "./product-columns.js";
import { PRODUCT_INCLUDE, toProduct } from "./product-rows.js";

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

  /**
   * Produit + déclinaison par défaut + réservation des deux références, **en une
   * transaction**. L'invariant « au moins une déclinaison, exactement une par défaut »
   * n'est ainsi jamais faux, même une fraction de seconde.
   *
   * C'est ici — et nulle part ailleurs — que la violation d'unicité Postgres est traduite
   * en erreur métier : ni le handler ni le contrôleur ne connaissent le code `P2002`.
   */
  async add(product: Product): Promise<void> {
    // Non résolu, comme `save` — inoffensif ici (la déclinaison par défaut ne
    // peut pas se suivre elle-même), mais laisser deux règles d'écriture serait
    // inviter la prochaine à choisir la mauvaise.
    const snapshot = product.persistenceSnapshot();
    const [defaultVariant] = snapshot.variants;
    if (defaultVariant === undefined) {
      throw new ProductWithoutVariantError(product.id);
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
            ...productColumns(snapshot),
            variants: {
              create: {
                id: defaultVariant.id,
                sku: defaultVariant.sku,
                name: localizedColumn(defaultVariant.name),
                internalLabel: defaultVariant.internalLabel ?? null,
                isDefault: defaultVariant.isDefault,
                // La trace d'un détachement s'écrit à la naissance, et nulle part ailleurs.
                detachedFromVariantId: defaultVariant.detachedFromVariantId ?? null,
                position: defaultVariant.position,
                // Un produit né d'un détachement garde le sur mesure de la
                // déclinaison qu'il était.
                customRecipe: defaultVariant.customRecipe ?? false,
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
   * agrégat en porte une poignée, et deviner demanderait une écriture par
   * mutation, à tenir d'accord avec le domaine à la main.
   */
  async save(product: Product): Promise<void> {
    // 🔴 L'instantané NON résolu. `snapshot()` substitue le prix et la fiche du
    // défaut aux déclinaisons alignées : l'écrire ici recopierait le défaut dans
    // leurs colonnes propres et détruirait ce qu'elles portaient, contre la
    // promesse de `Variant.follows`. Les lecteurs résolvent à la lecture.
    const snapshot = product.persistenceSnapshot();
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id: snapshot.id }, data: productColumns(snapshot) }),
      ...this.vatOverrideWrites(snapshot),
      ...this.variantWrites(snapshot),
    ]);
  }

  /**
   * Les dérogations se REMPLACENT d'un bloc : un `upsert` par contexte
   * laisserait vivre la ligne d'un contexte qu'on vient de rendre à sa
   * famille, et « je reviens à l'héritage » ressemblerait à « rien changé ».
   */
  private vatOverrideWrites(snapshot: ProductSnapshot) {
    return [
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
    ];
  }

  /**
   * `upsert` et non `update` : une déclinaison AJOUTÉE par ce passage
   * n'existe pas encore en base, et un `update` échouerait sur elle. La
   * réservation de sa référence part avec, dans la même transaction — sans
   * quoi un SKU vivrait sur une déclinaison que le registre ignore, et le
   * prochain tirage pourrait le proposer à une autre.
   */
  private variantWrites(snapshot: ProductSnapshot) {
    return [
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
          create: variantCreateColumns(snapshot.id, variant),
          update: variantUpdateColumns(variant),
        }),
      ),
    ];
  }
}
