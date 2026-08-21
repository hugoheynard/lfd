import { Injectable, inject } from '@angular/core';

import { CategoryStore } from './category-store';
import { ProductHttpApi } from './product-http-api';
import { TvaStore } from './tva-regimes/tva-store';

// Types re-exportés depuis le modèle central : les pages continuent d'importer
// `type Category` / `type Product` depuis ce fichier sans changement.
export type {
  Category,
  Emplacement,
  EmplacementTable,
  LocalizedText,
  Product,
  ProductKind,
  ProductStatus,
  SalesChannels,
  TvaRegime,
  Variant,
} from '../data/models';

import type { Category, Product, ProductKind, SalesChannels, TvaRegime } from '../data/models';

/**
 * Façade catalogue — délègue au backend Prisma via des **stores réactifs**
 * (familles, TVA) et le client produit. Plus aucune branche LocalDb : produits,
 * familles et régimes de TVA vivent tous côté serveur. Les signatures restent des
 * `Promise` ; les pages ne voient pas la couche réseau.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly productsApi = inject(ProductHttpApi);
  private readonly categoryStore = inject(CategoryStore);
  private readonly tvaStore = inject(TvaStore);

  // ── Familles (backend `catalogue/categories`, via CategoryStore) ──────────

  async listCategories(): Promise<Category[]> {
    await this.categoryStore.reload();
    return [...this.categoryStore.items()];
  }

  async createCategory(payload: { nameFr: string; parentId?: string }): Promise<{ id: string }> {
    return this.categoryStore.create(payload);
  }

  async renameCategory(id: string, nameFr: string): Promise<void> {
    await this.categoryStore.rename(id, nameFr);
  }

  async archiveCategory(id: string): Promise<void> {
    await this.categoryStore.archive(id);
  }

  /** Défaut de canaux d'une gamme — les produits hérités en héritent. */
  async setCategoryChannelPreset(id: string, preset: SalesChannels): Promise<void> {
    await this.categoryStore.setChannels(id, preset);
  }

  /** Régimes de TVA appliqués aux fiches à emporter / sur place d'une catégorie. */
  async setCategoryTva(id: string, emporterTvaId: string, surPlaceTvaId: string): Promise<void> {
    await this.categoryStore.setTva(id, emporterTvaId, surPlaceTvaId);
  }

  // ── Régimes de TVA (backend `commerce/tva-regimes`, via TvaStore) ─────────

  async listTvaRegimes(): Promise<TvaRegime[]> {
    await this.tvaStore.reload();
    return [...this.tvaStore.items()];
  }

  // ── Produits (backend `catalogue/products`, via ProductHttpApi) ──────────

  async listProducts(): Promise<Product[]> {
    return this.productsApi.list();
  }

  /** Détail enrichi (éditorial compris) — pour la page d'édition produit. */
  async getProduct(id: string): Promise<Product | null> {
    return this.productsApi.get(id);
  }

  async createProduct(payload: {
    nameFr: string;
    kind: ProductKind;
    categoryId: string;
    sku?: string;
    allergens?: string[];
    channelsOverride?: SalesChannels | null;
    priceEur?: number;
    weightGrams?: number;
    handleFr?: string;
    descriptionFr?: string;
  }): Promise<{ id: string }> {
    // `channelsOverride` / `handleFr` différés : les canaux relèvent du contexte
    // commerce et le slug est dérivé côté backend.
    return this.productsApi.create({
      nameFr: payload.nameFr,
      kind: payload.kind,
      categoryId: payload.categoryId,
      sku: payload.sku,
      allergens: payload.allergens,
      descriptionFr: payload.descriptionFr,
      priceEur: payload.priceEur,
      weightGrams: payload.weightGrams,
    });
  }

  async publishProduct(id: string): Promise<void> {
    await this.productsApi.publish(id);
  }

  async unpublishProduct(id: string): Promise<void> {
    await this.productsApi.unpublish(id);
  }

  async archiveProduct(id: string): Promise<void> {
    await this.productsApi.archive(id);
  }

  /** Pas de suppression physique (R3 backend) : « supprimer » = archiver. */
  async deleteProduct(id: string): Promise<void> {
    await this.productsApi.archive(id);
  }
}
