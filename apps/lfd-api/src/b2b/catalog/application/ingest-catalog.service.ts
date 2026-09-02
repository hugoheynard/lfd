import { Injectable } from "@nestjs/common";
import type { CatalogSnapshot } from "@lfd/catalog-sync";

import { CatalogItem, type PimFacts } from "../domain/entities/catalog-item.js";
import { CatalogCategoryProjection } from "../domain/ports/catalog-category.projection.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";

/** Ce qu'une ingestion a réellement changé, pour que l'appelant puisse le dire. */
export interface IngestionOutcome {
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly acceptedCategories: number;
  /**
   * Les SKU présents avant, absents du snapshot — donc **retirés de la vente**.
   *
   * Retirés, pas supprimés : leur ligne reste, leur prix négocié aussi, et un
   * push qui les rapporte les remet en rayon. Le nom garde le mot du contrat de
   * fil, que la plateforme rend à l'émetteur.
   */
  readonly removedSkus: readonly string[];
}

/**
 * Applique un snapshot du PIM, **par les agrégats**.
 *
 * Le cycle est celui de la maison, appliqué en lot : charger, muter par une
 * méthode métier (`refreshFromPim` / `receive`), rendre au port. Aucune colonne
 * n'est écrite depuis ici, et c'est ce qui met l'invariant hors de portée : un
 * article existant est **rafraîchi**, et `refreshFromPim` reporte sa décision
 * sans avoir le pouvoir de la modifier.
 *
 * La version précédente écrivait en `upsert` direct, avec le contrat « ne jamais
 * supprimer puis recréer » posé en commentaire. Le commentaire était juste ; il
 * ne protégeait rien — le prochain appelant n'avait qu'à l'ignorer.
 */
@Injectable()
export class IngestCatalogService {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly categories: CatalogCategoryProjection,
  ) {}

  async apply(
    snapshot: CatalogSnapshot,
    excludedSkus: readonly string[] = [],
  ): Promise<IngestionOutcome> {
    // 🔴 Un SKU écarté garde ses faits COURANTS — il n'a simplement pas changé.
    //
    // Ça vaut dans les DEUX sens, et c'est ce qui rend le geste uniforme : un
    // changement écarté ne s'écrit pas, et un RETRAIT écarté ne s'applique pas.
    // On n'écarte donc pas une ligne mais un SKU, ce qui rend exprimable le
    // refus d'un retrait — impossible autrement, un retrait n'étant qu'une
    // absence dans le snapshot.
    const excluded = new Set(excludedSkus);
    const receivedAt = new Date(snapshot.generatedAt);

    // Les familles d'abord : les articles y font référence.
    await this.categories.replaceAll(
      snapshot.categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        position: category.position,
        vatRatePercent: category.vatRatePercent,
        receivedAt,
      })),
    );

    const incoming = factsOf(snapshot, receivedAt);
    // 🔴 Les RETIRÉS compris, et c'est indispensable : un SKU réintroduit doit
    // être reconnu comme connu pour que son prix négocié lui revienne. Vu par
    // `loadAll()`, il serait absent, donc reçu à neuf — et `saveMany`
    // supprimerait l'override d'un article qu'on vient de remettre en vente.
    const existing = new Map(
      (await this.items.loadAllIncludingWithdrawn()).map((item) => [item.sku, item]),
    );

    const toSave = incoming
      .filter((facts) => !excluded.has(facts.sku))
      .map((facts) => {
        const known = existing.get(facts.sku);
        return known === undefined ? CatalogItem.receive(facts) : known.refreshFromPim(facts);
      });

    // 🔴 Le retrait MARQUE, il ne supprime plus — et il passe donc par l'agrégat.
    //
    // `removeMany(skus)` écrivait une colonne à partir de primitives : c'est le
    // « transaction script » que le §3.1 interdit, et il n'était acceptable que
    // parce que « supprimer » n'est pas muter un état. Marquer, si.
    //
    // Le même instant pour tout le lot, et il vient du snapshot : c'est la
    // livraison qui retire, pas l'horloge de celui qui l'applique.
    const arriving = new Set(incoming.map((facts) => facts.sku));
    const withdrawn = [...existing.entries()]
      // `!item.isWithdrawn` : sans lui, chaque push réécrirait toute la liste
      // des articles jamais retirés — un coût qui croît pour un résultat
      // identique, `withdraw()` étant idempotent.
      .filter(([sku, item]) => !arriving.has(sku) && !excluded.has(sku) && !item.isWithdrawn)
      .map(([, item]) => {
        item.withdraw(receivedAt);
        return item;
      });

    await this.items.saveMany([...toSave, ...withdrawn]);

    return {
      acceptedProducts: snapshot.products.length,
      acceptedVariants: toSave.length,
      acceptedCategories: snapshot.categories.length,
      removedSkus: withdrawn.map((item) => item.sku),
    };
  }
}

/** Aplatit produits × déclinaisons en faits d'articles, dans l'ordre reçu. */
function factsOf(snapshot: CatalogSnapshot, receivedAt: Date): PimFacts[] {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      productId: product.id,
      productSku: product.sku,
      name: variant.name,
      kind: product.kind,
      categoryId: product.categoryId,
      priceMillicents: variant.priceMillicents,
      weightGrams: variant.weightGrams,
      isDefault: variant.isDefault,
      position: variant.position,
      vatRatePercent: variant.vatRatePercent,
      allergens: variant.allergens,
      // Projetées par le PIM (D6) : la plateforme n'a plus le référentiel
      // réglementaire, elle range ce qu'on lui envoie.
      allergenLabels: variant.allergenLabels,
      receivedAt,
    })),
  );
}
