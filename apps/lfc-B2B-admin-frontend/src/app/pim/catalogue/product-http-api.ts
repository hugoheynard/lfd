import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ProductDetailView,
  UploadedMediaView,
  ProductEditorialView,
  ProductView,
  VariantNutritionView,
  VariantView,
  LocalizedText,
} from '@lfd/pim-contracts';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Product, ProductKind, Variant } from '../data/models';

// Formes RENDUES par l'API = vues du contrat `@lfd/pim-contracts`. `priceCents`
// HT canonique ; le front l'expose en euros dans `priceEur` (TTC/HT relève de la
// couche pricing, différé). Canaux/flags neutralisés (contexte commerce).

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

/** Couche éditoriale à plat (FR), champs vides = chaîne vide — pour l'édition. */
/**
 * La couche éditoriale, dans toutes ses langues. `brand` reste une chaîne : une
 * marque est un nom propre, elle ne se traduit pas.
 *
 * `null` plutôt que `''` pour l'absence : une valeur localisée absente n'a pas
 * de langue source, et `{ fr: '' }` serait comptée comme renseignée par tout ce
 * qui lit les locales remplies.
 */
export interface EditorialFields {
  readonly descriptionShort: LocalizedText | null;
  readonly descriptionLong: LocalizedText | null;
  readonly story: LocalizedText | null;
  readonly pairing: LocalizedText | null;
  readonly brand: string;
  readonly seoTitle: LocalizedText | null;
  readonly seoDescription: LocalizedText | null;
}

/**
 * Un visuel attaché : son rôle, son URL, son texte alternatif.
 *
 * Les dimensions sont **lues, jamais renvoyées** : le serveur les a mesurées
 * dans les octets au dépôt, et les relit lui-même au rattachement. Elles ne
 * servent ici qu'à réserver la place de l'aperçu — sans elles la liste saute au
 * chargement. `null`/absent = visuel saisi par son URL, qu'on n'héberge pas.
 */
export interface MediaSlot {
  role: string;
  url: string;
  /** Le SEUL champ d'image qui se traduit. */
  alt?: LocalizedText;
  readonly width?: number | null;
  readonly height?: number | null;
}

/** Détail complet pour la page d'édition : produit + éditorial + fiche + visuels. */
export interface ProductDetail {
  readonly product: Product;
  readonly editorial: EditorialFields;
  /** Allergènes de la déclinaison par défaut ; `null` = fiche non renseignée. */
  readonly allergens: readonly string[] | null;
  readonly mayContain: readonly string[];
  readonly nutrition: NutritionValues;
  /** Les visuels attachés, dans l'ordre. Relus depuis peu : ils ne l'étaient pas. */
  readonly media: readonly MediaSlot[];
}

function toNutritionValues(nutrition: VariantNutritionView | null): NutritionValues {
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

function toEditorialFields(editorial: ProductEditorialView | null): EditorialFields {
  return {
    descriptionShort: editorial?.descriptionShort ?? null,
    descriptionLong: editorial?.descriptionLong ?? null,
    story: editorial?.story ?? null,
    pairing: editorial?.pairing ?? null,
    brand: editorial?.brand ?? '',
    seoTitle: editorial?.seoTitle ?? null,
    seoDescription: editorial?.seoDescription ?? null,
  };
}

function defaultVariant(product: ProductView): VariantView | undefined {
  return product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
}

function toVariant(variant: VariantView): Variant {
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
  product: ProductView,
  editorial?: { descriptionShort: LocalizedText | null } | null,
): Product {
  const base = defaultVariant(product);
  const price = base?.priceCents;
  const weight = base?.weightGrams;
  const description = editorial?.descriptionShort?.[SOURCE_LOCALE];
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
  readonly name: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
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
    const rows = await firstValueFrom(this.http.get<ProductView[]>(this.url('products')));
    return rows.map((row) => backendToProduct(row));
  }

  async get(id: string): Promise<Product | null> {
    const row = await firstValueFrom(
      this.http.get<ProductDetailView | null>(this.url(`products/${id}`)),
    );
    return row === null ? null : backendToProduct(row, row.editorial);
  }

  /** Détail complet pour l'édition : produit mappé + éditorial à plat. */
  async getDetail(id: string): Promise<ProductDetail | null> {
    const row = await firstValueFrom(
      this.http.get<ProductDetailView | null>(this.url(`products/${id}`)),
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
      media: row.media.map((item) => ({
        role: item.role,
        url: item.url,
        alt: item.alt,
        width: item.width,
        height: item.height,
      })),
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
        name: input.name,
        kind: input.kind,
        categoryId: input.categoryId,
        ...(input.allergens === undefined ? {} : { allergens: input.allergens }),
        ...(input.descriptionFr === undefined || input.descriptionFr === ''
          ? {}
          : { editorial: { descriptionShort: { fr: input.descriptionFr } } }),
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
    input: { name: LocalizedText; kind: ProductKind; categoryId: string },
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

  /**
   * Section **Visuels** — la liste entière, dans son ordre.
   *
   * Un remplacement : ce que l'écran affiche fait foi. Ce panneau n'avait aucune
   * route ; on pouvait attacher des images à la création, et plus jamais.
   */
  /**
   * Dépose une image dans la bibliothèque et rend son entrée.
   *
   * Séparé de l'enregistrement de la section : déposer crée un fichier, ranger
   * décide où il sert. Un dépôt ne modifie donc AUCUN produit — c'est ce qui
   * permet d'illustrer un produit qu'on est en train de créer, et ce qui fait
   * qu'une image déposée puis non enregistrée ne casse rien.
   */
  async uploadMedia(file: File): Promise<UploadedMediaView> {
    const body = new FormData();
    body.append('file', file);
    return firstValueFrom(this.http.post<UploadedMediaView>(this.url('media'), body));
  }

  saveMedia(id: string, media: readonly MediaSlot[]): Promise<void> {
    return this.put(`products/${id}/media`, {
      media: media.map((slot) => ({
        role: slot.role,
        url: slot.url,
        ...(slot.alt === undefined ? {} : { alt: slot.alt }),
      })),
    });
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

  /** Mise en vente. Le back refuse si une déclinaison active n'a pas de fiche. */
  publish(id: string): Promise<void> {
    return this.put(`products/${id}/publish`, {});
  }

  /** Retrait de la vente : le produit redevient brouillon, pas archivé. */
  unpublish(id: string): Promise<void> {
    return this.put(`products/${id}/unpublish`, {});
  }

  archive(id: string): Promise<void> {
    return this.put(`products/${id}/archive`, {});
  }

  restore(id: string): Promise<void> {
    return this.put(`products/${id}/restore`, {});
  }

  private async applyInitialPricing(id: string, input: CreateProductInput): Promise<void> {
    const detail = await this.get(id);
    const variantId = detail?.variants.find((v) => v.isDefault)?.id;
    if (variantId === undefined) {
      return;
    }
    await this.savePricing(id, variantId, {
      priceCents: input.priceEur === undefined ? null : Math.round(input.priceEur * 100),
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
