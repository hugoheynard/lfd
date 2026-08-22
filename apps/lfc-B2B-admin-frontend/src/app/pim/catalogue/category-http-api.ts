import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CategoryView, SalesChannels } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Category } from '../data/models';

/**
 * Le backend rend une `CategoryView` (contrat `@lfd/pim-contracts`) où les
 * références de TVA sont **nullables** (`null` = non réglé) ; le modèle front les
 * veut en chaîne, `''` faisant office de « non réglé ». D'où ce mapper.
 */
function toCategory(row: CategoryView): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parentId,
    position: row.position,
    isArchived: row.isArchived,
    channelPreset: row.channelPreset,
    emporterTvaId: row.emporterTvaId ?? '',
    surPlaceTvaId: row.surPlaceTvaId ?? '',
    activeProductCount: row.activeProductCount,
  };
}

/** `''` (non réglé côté front) → `null` (non réglé côté backend). */
function toRef(id: string): string | null {
  return id === '' ? null : id;
}

/**
 * Accès **réel** aux familles — parle au backend (`catalogue/categories`).
 * Remplace la branche LocalDb. Signatures en `Promise` : les appelants ne voient
 * pas la couche réseau.
 */
@Injectable({ providedIn: 'root' })
export class CategoryHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<Category[]> {
    const rows = await firstValueFrom(this.http.get<CategoryView[]>(this.url('categories')));
    return rows.map(toCategory);
  }

  create(payload: { nameFr: string; parentId?: string | undefined }): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(this.url('categories'), {
        nameFr: payload.nameFr,
        ...(payload.parentId === undefined || payload.parentId === ''
          ? {}
          : { parentId: payload.parentId }),
      }),
    );
  }

  rename(id: string, nameFr: string): Promise<void> {
    return this.put(`categories/${id}/name`, { nameFr });
  }

  archive(id: string): Promise<void> {
    return this.put(`categories/${id}/archive`, {});
  }

  setChannels(id: string, channels: SalesChannels): Promise<void> {
    return this.put(`categories/${id}/channels`, channels);
  }

  setTva(id: string, emporterTvaId: string, surPlaceTvaId: string): Promise<void> {
    return this.put(`categories/${id}/tva`, {
      emporterTvaId: toRef(emporterTvaId),
      surPlaceTvaId: toRef(surPlaceTvaId),
    });
  }

  private async put(path: string, body: unknown): Promise<void> {
    await firstValueFrom(this.http.put(this.url(path), body));
  }

  private url(path: string): string {
    return `${this.base}/catalogue/${path}`;
  }
}
