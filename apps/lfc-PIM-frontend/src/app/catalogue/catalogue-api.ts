import { Injectable, inject } from '@angular/core';

import { tvaTagFromPercent } from '../data/channels';
import { LocalDb } from '../data/local-db';
import { productSkuRoot, proposeSku, slugify } from '../data/sku';

// Types re-exportés depuis le modèle central : les pages continuent d'importer
// `type Category` / `type Product` depuis ce fichier sans changement.
export type {
  Category,
  LocalizedText,
  Product,
  ProductKind,
  ProductStatus,
  SalesChannels,
  TvaRegime,
  Variant,
} from '../data/models';

import type {
  Category,
  Product,
  ProductKind,
  SalesChannels,
  TvaRegime,
} from '../data/models';

/** Erreur métier — message déjà rédigé, prêt à afficher. */
export class CatalogueApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${performance.now().toString(36).replace('.', '')}`;
}

/**
 * Catalogue — implémentation **locale** (POC frontend-only) sur {@link LocalDb}.
 * Les méthodes gardent leur signature d'origine (Promise) : les pages ne voient
 * pas la différence entre ceci et l'ancien client HTTP.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly db = inject(LocalDb);

  async listCategories(): Promise<Category[]> {
    return structuredClone(this.db.snapshot().categories);
  }

  async createCategory(payload: {
    nameFr: string;
    parentId?: string;
  }): Promise<{ id: string }> {
    const name = payload.nameFr.trim();
    if (name === '') {
      throw new CatalogueApiError('category.name.empty', 'Le nom est obligatoire.');
    }
    const id = nextId('cat');
    this.db.update((draft) => {
      // Défauts éditables ensuite : à emporter dans les deux boutiques, régime
      // réduit à emporter / intermédiaire sur place quand ils existent.
      const reduced = draft.tvaRegimes.find((r) => r.percent === 5.5);
      const intermediate = draft.tvaRegimes.find((r) => r.percent === 10);
      const fallback = draft.tvaRegimes[0]?.id ?? '';
      draft.categories.push({
        id,
        name: { fr: name },
        slug: { fr: slugify(name) },
        parentId: payload.parentId ?? null,
        position: draft.categories.length + 1,
        isArchived: false,
        channelPreset: {
          b1: { emporter: true, surPlace: false },
          b2: { emporter: true, surPlace: false },
        },
        emporterTvaId: reduced?.id ?? fallback,
        surPlaceTvaId: intermediate?.id ?? fallback,
      });
    });
    return { id };
  }

  async renameCategory(id: string, nameFr: string): Promise<void> {
    const name = nameFr.trim();
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.name = { fr: name };
      target.slug = { fr: slugify(name) };
    });
  }

  async archiveCategory(id: string): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.isArchived = true;
    });
  }

  /** Défaut de canaux d'une gamme — les produits hérités en héritent. */
  async setCategoryChannelPreset(
    id: string,
    preset: SalesChannels,
  ): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.channelPreset = preset;
    });
  }

  /** Régimes de TVA appliqués aux fiches à emporter / sur place d'une catégorie. */
  async setCategoryTva(
    id: string,
    emporterTvaId: string,
    surPlaceTvaId: string,
  ): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.emporterTvaId = emporterTvaId;
      target.surPlaceTvaId = surPlaceTvaId;
    });
  }

  // ── Régimes de TVA (= collections Famille A, données créables) ────────────

  async listTvaRegimes(): Promise<TvaRegime[]> {
    return structuredClone(this.db.snapshot().tvaRegimes);
  }

  async createTvaRegime(payload: {
    name: string;
    description?: string;
    percent: number;
  }): Promise<{ id: string }> {
    const name = payload.name.trim();
    if (name === '') {
      throw new CatalogueApiError('tva.name.empty', 'Le nom est obligatoire.');
    }
    if (!Number.isFinite(payload.percent) || payload.percent < 0) {
      throw new CatalogueApiError('tva.percent.invalid', 'Taux invalide.');
    }
    const id = nextId('tva');
    this.db.update((draft) => {
      const tag = tvaTagFromPercent(payload.percent);
      if (draft.tvaRegimes.some((r) => r.tag === tag)) {
        throw new CatalogueApiError(
          'tva.tag.duplicate',
          `Un régime à ${payload.percent} % existe déjà (${tag}).`,
        );
      }
      draft.tvaRegimes.push({
        id,
        name,
        description: payload.description?.trim() ?? '',
        percent: payload.percent,
        tag,
      });
    });
    return { id };
  }

  /** Supprime un régime — refusé s'il est encore référencé par une catégorie. */
  async deleteTvaRegime(id: string): Promise<void> {
    this.db.update((draft) => {
      const used = draft.categories.some(
        (c) => c.emporterTvaId === id || c.surPlaceTvaId === id,
      );
      if (used) {
        throw new CatalogueApiError(
          'tva.in_use',
          'Régime utilisé par une catégorie — réaffectez-la d’abord.',
        );
      }
      const index = draft.tvaRegimes.findIndex((r) => r.id === id);
      if (index !== -1) {
        draft.tvaRegimes.splice(index, 1);
      }
    });
  }

  async listProducts(): Promise<Product[]> {
    return structuredClone(this.db.snapshot().products);
  }

  async createProduct(payload: {
    nameFr: string;
    kind: ProductKind;
    categoryId: string;
    sku?: string;
    allergens?: string[];
    channelsOverride?: SalesChannels | null;
  }): Promise<{ id: string }> {
    const name = payload.nameFr.trim();
    if (name === '') {
      throw new CatalogueApiError('product.name.empty', 'Le nom est obligatoire.');
    }
    const id = nextId('prd');

    this.db.update((draft) => {
      const category = draft.categories.find((c) => c.id === payload.categoryId);
      if (category === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      if (category.isArchived) {
        throw new CatalogueApiError('category.archived', 'Cette famille est archivée.');
      }

      const taken = new Set<string>();
      for (const p of draft.products) {
        taken.add(p.sku);
        for (const v of p.variants) {
          taken.add(v.sku);
        }
      }

      const proposed =
        payload.sku !== undefined && payload.sku.trim() !== ''
          ? payload.sku.trim().toUpperCase()
          : proposeSku(productSkuRoot(category.slug.fr, name), taken);
      taken.add(proposed);

      const variantSku = proposeSku(`${proposed}-1`, taken);

      draft.products.push({
        id,
        sku: proposed,
        name: { fr: name },
        kind: payload.kind,
        categoryId: payload.categoryId,
        status: 'draft',
        // Canaux hérités de la catégorie, sauf override fourni à la création.
        channelsOverride: payload.channelsOverride ?? null,
        variants: [
          {
            id: `${id}_v1`,
            sku: variantSku,
            name: { fr: name },
            isDefault: true,
            isDiscontinued: false,
            allergens: payload.allergens ?? null,
          },
        ],
      });
    });

    return { id };
  }

  async renameProduct(id: string, nameFr: string): Promise<void> {
    const name = nameFr.trim();
    this.db.update((draft) => {
      const target = draft.products.find((p) => p.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('product.not_found', 'Produit introuvable.');
      }
      target.name = { fr: name };
    });
  }

  async archiveProduct(id: string): Promise<void> {
    this.db.update((draft) => {
      const target = draft.products.find((p) => p.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('product.not_found', 'Produit introuvable.');
      }
      target.status = 'archived';
    });
  }

  /** Override tout-ou-rien des canaux ; `null` = revenir au défaut de la gamme. */
  async setProductChannels(
    id: string,
    channels: SalesChannels | null,
  ): Promise<void> {
    this.db.update((draft) => {
      const target = draft.products.find((p) => p.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('product.not_found', 'Produit introuvable.');
      }
      target.channelsOverride = channels;
    });
  }
}
