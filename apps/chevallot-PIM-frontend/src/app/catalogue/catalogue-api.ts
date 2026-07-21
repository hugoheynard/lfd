import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Textes traduisibles — `fr` obligatoire, repli sur `fr`.
 * (Duplication assumée du contrat backend : `packages/shared-types` reste à créer.)
 */
export interface LocalizedText {
  fr: string;
  en?: string;
}

export interface Category {
  id: string;
  name: LocalizedText;
  slug: LocalizedText;
  parentId: string | null;
  position: number;
  isArchived: boolean;
}

export type ProductKind = 'daily' | 'made_to_order' | 'resale';
export type ProductStatus = 'draft' | 'published' | 'archived';

export interface Variant {
  id: string;
  sku: string;
  name: LocalizedText;
  isDefault: boolean;
  isDiscontinued: boolean;
  /** `null` = fiche non renseignée ; `[]` = « aucun allergène » déclaré. */
  allergens: string[] | null;
}

export interface Product {
  id: string;
  sku: string;
  name: LocalizedText;
  kind: ProductKind;
  categoryId: string;
  status: ProductStatus;
  variants: Variant[];
}

/** Erreur métier renvoyée par l'API — message déjà rédigé côté serveur. */
export interface ApiError {
  code: string;
  message: string;
}

const BASE_URL = 'http://localhost:3100/catalogue';

export class CatalogueApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function toApiError(error: unknown): CatalogueApiError {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      const code = 'code' in body && typeof body.code === 'string' ? body.code : 'http.error';
      return new CatalogueApiError(code, body.message);
    }
    return new CatalogueApiError('http.error', 'Le serveur est injoignable.');
  }
  return new CatalogueApiError('unknown', 'Erreur inattendue.');
}

@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly http = inject(HttpClient);

  listCategories(): Promise<Category[]> {
    return this.send(this.http.get<Category[]>(`${BASE_URL}/categories`));
  }

  createCategory(payload: {
    nameFr: string;
    parentId?: string;
  }): Promise<{ id: string }> {
    return this.send(
      this.http.post<{ id: string }>(`${BASE_URL}/categories`, payload),
    );
  }

  renameCategory(id: string, nameFr: string): Promise<unknown> {
    return this.send(
      this.http.put(`${BASE_URL}/categories/${id}/name`, { nameFr }),
    );
  }

  archiveCategory(id: string): Promise<unknown> {
    return this.send(this.http.put(`${BASE_URL}/categories/${id}/archive`, {}));
  }

  listProducts(): Promise<Product[]> {
    return this.send(this.http.get<Product[]>(`${BASE_URL}/products`));
  }

  createProduct(payload: {
    nameFr: string;
    kind: ProductKind;
    categoryId: string;
    sku?: string;
    allergens?: string[];
    mayContain?: string[];
    nutrition?: Record<string, number>;
  }): Promise<{ id: string }> {
    return this.send(
      this.http.post<{ id: string }>(`${BASE_URL}/products`, payload),
    );
  }

  renameProduct(id: string, nameFr: string): Promise<unknown> {
    return this.send(
      this.http.put(`${BASE_URL}/products/${id}/name`, { nameFr }),
    );
  }

  archiveProduct(id: string): Promise<unknown> {
    return this.send(this.http.put(`${BASE_URL}/products/${id}/archive`, {}));
  }

  private async send<T>(source: Parameters<typeof firstValueFrom<T>>[0]): Promise<T> {
    try {
      return await firstValueFrom(source);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
