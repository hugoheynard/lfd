import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type {
  LocalizedText,
  Product,
  ProductKind,
  Variant,
} from '../data/models';

// ── Contrat backend (lfc-PIM-backend / catalogue) ──────────────────────────
// Formes RENDUES par l'API. Duplication assumée tant que packages/shared-types
// n'existe pas (cf. models.ts). `priceCents` HT canonique ; le front l'expose en
// euros dans `priceEur` (la distinction TTC/HT est un souci de la couche pricing,
// différé). Canaux/flags absents du backend en slice 1 → défauts neutres.

interface BackendNutrition {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
  readonly glycemicIndex: number | null;
}

interface BackendVariant {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly allergens: readonly string[] | null;
  readonly nutrition: BackendNutrition | null;
}

/** Valeurs nutritionnelles pour 100 g (édition) ; `null` = non renseigné. */
export interface NutritionValues {
  readonly energyKcal: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
  readonly glycemicIndex: number | null;
}

const EMPTY_NUTRITION: NutritionValues = {
  energyKcal: null,
  carbsG: null,
  fatG: null,
  proteinG: null,
  glycemicIndex: null,
};

interface BackendProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: Product['status'];
  readonly variants: readonly BackendVariant[];
}

interface BackendEditorial {
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly story: string | null;
  readonly pairing: string | null;
  readonly brand: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

type BackendProductDetail = BackendProduct & {
  readonly editorial: BackendEditorial | null;
};

/** Couche éditoriale à plat (FR), champs vides = chaîne vide — pour l'édition. */
export interface EditorialFields {
  readonly descriptionShort: string;
  readonly descriptionLong: string;
  readonly story: string;
  readonly pairing: string;
  readonly brand: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

/** Détail complet pour la page d'édition : produit + éditorial + fiche réglementaire. */
export interface ProductDetail {
  readonly product: Product;
  readonly editorial: EditorialFields;
  /** Allergènes de la déclinaison par défaut ; `null` = fiche non renseignée. */
  readonly allergens: readonly string[] | null;
  readonly mayContain: readonly string[];
  readonly nutrition: NutritionValues;
}

function toNutritionValues(nutrition: BackendNutrition | null): NutritionValues {
  return nutrition === null
    ? EMPTY_NUTRITION
    : {
        energyKcal: nutrition.energyKcal,
        carbsG: nutrition.carbsG,
        fatG: nutrition.fatG,
        proteinG: nutrition.proteinG,
        glycemicIndex: nutrition.glycemicIndex,
      };
}

function toEditorialFields(editorial: BackendEditorial | null): EditorialFields {
  return {
    descriptionShort: editorial?.descriptionShort ?? '',
    descriptionLong: editorial?.descriptionLong ?? '',
    story: editorial?.story ?? '',
    pairing: editorial?.pairing ?? '',
    brand: editorial?.brand ?? '',
    seoTitle: editorial?.seoTitle ?? '',
    seoDescription: editorial?.seoDescription ?? '',
  };
}

function defaultVariant(product: BackendProduct): BackendVariant | undefined {
  return product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
}

function toVariant(variant: BackendVariant): Variant {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    isDefault: variant.isDefault,
    isDiscontinued: variant.isDiscontinued,
    allergens: variant.allergens === null ? null : [...variant.allergens],
  };
}

/**
 * Backend → modèle front. Le prix/poids viennent de la déclinaison par défaut ;
 * `channelsOverride` est neutralisé (contexte commerce, slice 2) ; `workflowFlags`
 * n'est plus porté (différé). `descriptionFr` n'existe que sur le détail enrichi.
 */
export function backendToProduct(
  product: BackendProduct,
  editorial?: { descriptionShort: string | null } | null,
): Product {
  const base = defaultVariant(product);
  const price = base?.priceCents;
  const weight = base?.weightGrams;
  const description = editorial?.descriptionShort;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    kind: product.kind,
    categoryId: product.categoryId,
    status: product.status,
    variants: product.variants.map(toVariant),
    channelsOverride: null,
    slug: product.slug,
    ...(price === null || price === undefined ? {} : { priceEur: price / 100 }),
    ...(weight === null || weight === undefined ? {} : { weightGrams: weight }),
    ...(description === null || description === undefined || description === ''
      ? {}
      : { descriptionFr: description }),
    workflowFlags: [],
  };
}

export interface CreateProductInput {
  readonly nameFr: string;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly sku?: string | undefined;
  readonly allergens?: readonly string[] | undefined;
  readonly descriptionFr?: string | undefined;
  readonly priceEur?: number | undefined;
  readonly weightGrams?: number | undefined;
}

/**
 * Accès produits **réel** — parle au backend (`catalogue/products`). Remplace la
 * branche LocalDb pour tout le domaine produit. Les signatures restent des
 * `Promise`, les pages ne voient pas la couche réseau.
 */
@Injectable({ providedIn: 'root' })
export class ProductHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<Product[]> {
    const rows = await firstValueFrom(
      this.http.get<BackendProduct[]>(this.url('products')),
    );
    return rows.map((row) => backendToProduct(row));
  }

  async get(id: string): Promise<Product | null> {
    const row = await firstValueFrom(
      this.http.get<BackendProductDetail | null>(this.url(`products/${id}`)),
    );
    return row === null ? null : backendToProduct(row, row.editorial);
  }

  /** Détail complet pour l'édition : produit mappé + éditorial à plat. */
  async getDetail(id: string): Promise<ProductDetail | null> {
    const row = await firstValueFrom(
      this.http.get<BackendProductDetail | null>(this.url(`products/${id}`)),
    );
    if (row === null) {
      return null;
    }
    const base = defaultVariant(row);
    return {
      product: backendToProduct(row, row.editorial),
      editorial: toEditorialFields(row.editorial),
      allergens: base?.allergens ?? null,
      mayContain: base?.nutrition?.mayContain ?? [],
      nutrition: toNutritionValues(base?.nutrition ?? null),
    };
  }

  /**
   * Crée le produit puis, si un prix/poids est fourni, tarife sa déclinaison par
   * défaut (le backend ne les prend pas à la création). La description part dans
   * l'éditorial du produit.
   */
  async create(input: CreateProductInput): Promise<{ id: string }> {
    const created = await firstValueFrom(
      this.http.post<{ id: string }>(this.url('products'), {
        nameFr: input.nameFr,
        kind: input.kind,
        categoryId: input.categoryId,
        ...(input.sku === undefined ? {} : { sku: input.sku }),
        ...(input.allergens === undefined ? {} : { allergens: input.allergens }),
        ...(input.descriptionFr === undefined || input.descriptionFr === ''
          ? {}
          : { editorial: { descriptionShort: input.descriptionFr } }),
      }),
    );
    if (input.priceEur !== undefined || input.weightGrams !== undefined) {
      await this.applyInitialPricing(created.id, input);
    }
    return created;
  }

  /** Section Identité — nom + nature + famille en une requête (pas de micro-PUT). */
  saveIdentity(
    id: string,
    input: { nameFr: string; kind: ProductKind; categoryId: string },
  ): Promise<void> {
    return this.put(`products/${id}/identity`, input);
  }

  /** Section Tarif & logistique — prix + poids de la déclinaison en une requête. */
  savePricing(
    id: string,
    variantId: string,
    input: { priceCents: number | null; weightGrams: number | null },
  ): Promise<void> {
    return this.put(`products/${id}/variants/${variantId}/pricing`, input);
  }

  /** Section Communication — couche éditoriale complète (une requête). */
  saveEditorial(id: string, editorial: EditorialFields): Promise<void> {
    return this.put(`products/${id}/editorial`, editorial);
  }

  /**
   * Section Fiche réglementaire — allergènes + valeurs nutritionnelles en une
   * requête (le backend remplace la déclaration entière ; les deux vont ensemble).
   */
  saveNutrition(
    id: string,
    variantId: string,
    input: {
      allergens: readonly string[];
      mayContain?: readonly string[];
      nutrition?: NutritionValues;
    },
  ): Promise<void> {
    // Le backend n'accepte que des nombres (optionnels) : on omet les `null`.
    const nutrition: Record<string, number> = {};
    if (input.nutrition !== undefined) {
      for (const [key, value] of Object.entries(input.nutrition)) {
        if (value !== null) {
          nutrition[key] = value;
        }
      }
    }
    return this.put(`products/${id}/variants/${variantId}/nutrition`, {
      allergens: input.allergens,
      ...(input.mayContain === undefined ? {} : { mayContain: input.mayContain }),
      ...(Object.keys(nutrition).length === 0 ? {} : { nutrition }),
    });
  }

  archive(id: string): Promise<void> {
    return this.put(`products/${id}/archive`, {});
  }

  restore(id: string): Promise<void> {
    return this.put(`products/${id}/restore`, {});
  }

  private async applyInitialPricing(
    id: string,
    input: CreateProductInput,
  ): Promise<void> {
    const detail = await this.get(id);
    const variantId = detail?.variants.find((v) => v.isDefault)?.id;
    if (variantId === undefined) {
      return;
    }
    await this.savePricing(id, variantId, {
      priceCents:
        input.priceEur === undefined ? null : Math.round(input.priceEur * 100),
      weightGrams: input.weightGrams === undefined ? null : input.weightGrams,
    });
  }

  private async put(path: string, body: unknown): Promise<void> {
    await firstValueFrom(this.http.put(this.url(path), body));
  }

  private url(path: string): string {
    return `${this.base}/catalogue/${path}`;
  }
}
