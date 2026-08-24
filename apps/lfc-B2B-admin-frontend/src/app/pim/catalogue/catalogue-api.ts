import { Injectable, inject } from '@angular/core';

import type { LocalizedText } from '@lfd/pim-contracts';

import { CategoryStore } from './category-store';
import { ProductHttpApi } from './product-http-api';
import { VatRateStore } from './vat-rates/vat-store';

// Types re-exportés depuis le modèle central : les pages continuent d'importer
// `type Category` / `type Product` depuis ce fichier sans changement.
export type {
  Category,
  Location,
  LocationTable,
  LocalizedText,
  Product,
  ProductKind,
  ProductStatus,
  SalesChannels,
  VatRate,
  Variant,
} from '../data/models';

import type { Category, Product, ProductKind, SalesChannels, VatRate } from '../data/models';

/**
 * Façade catalogue — délègue au backend Prisma via des **stores réactifs**
 * (familles, TVA) et le client produit. Plus aucune branche LocalDb : produits,
 * familles et taux de TVA vivent tous côté serveur. Les signatures restent des
 * `Promise` ; les pages ne voient pas la couche réseau.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly productsApi = inject(ProductHttpApi);
  private readonly categoryStore = inject(CategoryStore);
  private readonly vatRateStore = inject(VatRateStore);

  // ── Familles (backend `catalogue/categories`, via CategoryStore) ──────────

  async listCategories(): Promise<Category[]> {
    await this.categoryStore.reload();
    return [...this.categoryStore.items()];
  }

  // Les MUTATIONS de famille ne passent plus par ici : l'écran qui les émet
  // parle au `CategoryStore` directement. Cette classe ne réexpédiait plus
  // rien d'autre qu'un appel, et deux portes vers la même donnée finissent par
  // ne plus dire la même chose.

  // ── Taux de TVA (backend `commerce/vat-rates`, via VatRateStore) ─────────

  async listVatRates(): Promise<VatRate[]> {
    await this.vatRateStore.reload();
    return [...this.vatRateStore.items()];
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
    name: LocalizedText;
    kind: ProductKind;
    categoryId: string;
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
      name: payload.name,
      kind: payload.kind,
      categoryId: payload.categoryId,
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
