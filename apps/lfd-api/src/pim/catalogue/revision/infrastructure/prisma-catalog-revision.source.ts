import { Injectable } from "@nestjs/common";

import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import { EditorialReader } from "../../product/domain/ports/editorial-reader.js";
import { ReadinessRepository } from "../../product/domain/ports/readiness.repository.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { VariantNutritionView } from "../../product/domain/ports/product.repository.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";
import type { RevisionItemInput, RevisionMedia } from "../domain/revision.js";

/**
 * La matière d'une révision, lue en LOT.
 *
 * Trois lectures pour tout le catalogue, jamais une par produit : une capture
 * touche les quatre-vingt-douze fiches d'un coup, et une boucle d'appels y
 * coûterait autant d'allers-retours que d'articles.
 *
 * Les visuels passent par Prisma directement plutôt que par `mediaOf`, qui est
 * par produit. Ajouter un lot au port éditorial l'aurait élargi pour un seul
 * appelant ; la révision lit ce qu'elle a besoin de lire.
 */
@Injectable()
export class PrismaCatalogRevisionSource extends CatalogRevisionSource {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly editorials: EditorialReader,
    private readonly readiness: ReadinessRepository,
    private readonly prisma: PimPrismaService,
  ) {
    super();
  }

  async snapshotItems(): Promise<readonly RevisionItemInput[]> {
    const products = await this.catalogue.publishable();
    if (products.length === 0) {
      return [];
    }
    const ids = products.map((product) => product.id);
    const [categories, vatByProduct, channelsByProduct, editorials, mediaByProduct, signatures] =
      await Promise.all([
        this.catalogue.channelCategories(),
        this.catalogue.vatPercents(products),
        this.catalogue.effectiveChannels(products),
        this.editorials.findByProducts(ids),
        this.mediaOf(ids),
        this.readiness.readMany(ids),
      ]);
    const categoryName = new Map(categories.map((category) => [category.id, category.name]));

    return products.flatMap((product) => {
      const vat = vatByProduct.get(product.id) ?? {};
      // Les contextes réellement vendus, résolus : une ancre ne garde pas
      // « hérite de sa famille », elle garde la réponse.
      const sold = [...new Set((channelsByProduct.get(product.id) ?? []).map((c) => c.context))]
        .sort()
        .map((context) => context);
      const editorial = editorials.get(product.id) ?? null;
      const media = mediaByProduct.get(product.id) ?? [];
      // La signature est portée par le PRODUIT : ses déclinaisons partagent
      // donc la même, ce qui est exact — on valide une fiche, pas un article.
      const signed = signatures.get(product.id) ?? null;
      return product.variants.map((variant) => ({
        sku: variant.sku,
        productId: product.id,
        productSku: product.sku,
        name: product.name,
        variantName: variant.name,
        kind: product.kind,
        status: product.status,
        categoryId: product.categoryId,
        categoryName: categoryName.get(product.categoryId) ?? {},
        priceCents: variant.priceCents,
        weightGrams: variant.weightGrams,
        isDefault: variant.isDefault,
        isDiscontinued: variant.isDiscontinued,
        // La moitié « sécurité » est un objet depuis le lot 7 ; l'ancre, elle,
        // ne photographie que les codes DÉCLARÉS — sa forme ne bouge pas, et
        // toucher au tableau d'un article rebasculerait son empreinte.
        allergens: variant.allergenSheet === null ? null : [...variant.allergenSheet.declared],
        nutrition: nutritionOf(variant.nutrition),
        vatByContext: { ...vat },
        soldContexts: sold,
        editorial: editorial === null ? null : { ...editorial },
        media,
        readyAt: signed === null ? null : signed.readyAt.toISOString(),
        readyBy: signed?.readyBy ?? null,
      }));
    });
  }

  /**
   * Les visuels de plusieurs produits, dans leur ordre d'affichage.
   *
   * 🔴 En DEUX requêtes et non par un `include` : le rattachement désigne
   * l'image par son URL depuis le 2026-09-23, et la relation disparaîtra avec
   * la clé étrangère au déploiement ③
   * (`documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md`).
   *
   * Ce que ça change pour une ANCRE, et c'est ce qui compte ici : l'alternative
   * entre dans le payload **hashé** d'une révision. Elle vient désormais de
   * l'image elle-même — une seule par image — et non plus de la ligne d'actif
   * propre à chaque fiche.
   */
  private async mediaOf(ids: readonly string[]): Promise<Map<string, RevisionMedia[]>> {
    const rows = await this.prisma.productMedia.findMany({
      where: { productId: { in: [...ids] } },
      orderBy: [{ productId: "asc" }, { position: "asc" }],
      select: { productId: true, role: true, mediaUrl: true },
    });
    const urls = [...new Set(rows.flatMap((row) => (row.mediaUrl === null ? [] : [row.mediaUrl])))];
    const assets =
      urls.length === 0
        ? []
        : await this.prisma.mediaAsset.findMany({
            where: { url: { in: urls } },
            select: { url: true, alt: true },
          });
    const byUrl = new Map(assets.map((asset) => [asset.url, asset]));

    const byProduct = new Map<string, RevisionMedia[]>();
    for (const row of rows) {
      const asset = row.mediaUrl === null ? undefined : byUrl.get(row.mediaUrl);
      if (asset === undefined) {
        // Une ancre ne fige QUE ce qu'elle a pu lire. Un rattachement sans
        // image — une ligne antérieure au report de l'URL — n'entre pas dans
        // l'empreinte plutôt que d'y entrer à moitié.
        continue;
      }
      const media = byProduct.get(row.productId) ?? [];
      media.push({
        role: row.role,
        // L'ADRESSE, jamais les octets : ils vivent dans le bucket, et un visuel
        // remplacé est une AUTRE image, pas la même écrasée.
        url: asset.url,
        alt: altOf(asset.alt),
      });
      byProduct.set(row.productId, media);
    }
    return byProduct;
  }
}

/**
 * Les valeurs nutritionnelles d'une ancre, **dans l'ordre de l'annexe XV**.
 *
 * `null` quand AUCUNE n'est renseignée, et pas un objet de huit `null` : la
 * moitié allergènes et la moitié nutrition vivent désormais dans deux tables,
 * et l'instantané porte un bloc dès que l'une des deux existe. Sans cette
 * réduction, déclarer un allergène changerait l'empreinte nutritionnelle d'un
 * article dont personne n'a saisi une valeur.
 */
function nutritionOf(
  values: VariantNutritionView | null,
): Readonly<Record<string, number | null>> | null {
  if (values === null) {
    return null;
  }
  const declared = {
    energyKcal: values.energyKcal,
    fatG: values.fatG,
    saturatedFatG: values.saturatedFatG,
    carbsG: values.carbsG,
    sugarsG: values.sugarsG,
    proteinG: values.proteinG,
    saltG: values.saltG,
    glycemicIndex: values.glycemicIndex,
  };
  return Object.values(declared).every((value) => value === null) ? null : declared;
}

/**
 * L'alternative textuelle, relue sans repli.
 *
 * Pas de retour sur l'URL comme le fait le lecteur éditorial : ici on
 * PHOTOGRAPHIE, et une alternative absente doit rester absente dans l'ancre —
 * la remplacer ferait croire, dans six mois, qu'elle avait été écrite.
 */
function altOf(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const alt: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text === "string") {
      alt[locale] = text;
    }
  }
  return alt;
}
