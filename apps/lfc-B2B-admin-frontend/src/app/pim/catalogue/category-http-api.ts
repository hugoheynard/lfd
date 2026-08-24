import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CategoryView, LocalizedText, SalesChannels } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Category } from '../data/models';

/**
 * Le backend rend une `CategoryView` (contrat `@lfd/pim-contracts`). Les taux y
 * sont une carte indexée par contexte, et le front la transporte telle quelle :
 * une clé absente est « non réglé », des deux côtés.
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
    tvaByContext: row.tvaByContext,
    activeProductCount: row.activeProductCount,
  };
}

/**
 * Les taux saisis à l'écran, par clé de contexte. `''` = non réglé — c'est ce
 * que rend une liste déroulante vide, et la clé est **retirée** avant l'envoi
 * plutôt qu'envoyée à vide : « non réglé » ne s'écrit pas.
 */
export type CategoryVatDraft = Readonly<Record<string, string>>;

/** Retire les contextes laissés vides — le serveur n'accepte que du réglé. */
function settledOnly(draft: CategoryVatDraft): Record<string, string> {
  return Object.fromEntries(Object.entries(draft).filter(([, id]) => id !== ''));
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

  create(payload: { name: LocalizedText; parentId?: string | undefined }): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(this.url('categories'), {
        name: payload.name,
        ...(payload.parentId === undefined || payload.parentId === ''
          ? {}
          : { parentId: payload.parentId }),
      }),
    );
  }

  rename(id: string, name: LocalizedText): Promise<void> {
    return this.put(`categories/${id}/name`, { name });
  }

  /**
   * Déplace une famille — `null` = la racine.
   *
   * La route existait côté référentiel (avec son refus de cycle et son refus
   * de parent archivé, testés) et n'avait aucun appelant : le front ne l'avait
   * jamais câblée, et le champ « Parent » était donc réservé à la création.
   */
  move(id: string, parentId: string | null): Promise<void> {
    return this.put(`categories/${id}/parent`, { parentId });
  }

  archive(id: string): Promise<void> {
    return this.put(`categories/${id}/archive`, {});
  }

  setChannels(id: string, channels: SalesChannels): Promise<void> {
    return this.put(`categories/${id}/channels`, channels);
  }

  /**
   * Les taux d'un bloc, indexés par contexte. Une carte et non des arguments
   * positionnels : intervertir « sur place » et « B2B » ne se verrait ni au
   * compilateur ni à la lecture, et se paierait en TVA facturée.
   */
  setVat(id: string, ids: CategoryVatDraft): Promise<void> {
    return this.put(`categories/${id}/vat`, {
      tvaByContext: settledOnly(ids),
    });
  }

  private async put(path: string, body: unknown): Promise<void> {
    await firstValueFrom(this.http.put(this.url(path), body));
  }

  private url(path: string): string {
    return `${this.base}/catalogue/${path}`;
  }
}
