import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CategoryDetailView,
  CategoryEditorialPayload,
  CategoryMediaView,
  CategoryView,
  LocalizedText,
  SalesChannels,
  UploadedMediaView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Category } from '../data/models';
import type { CreatedIdResponse } from '@lfd/contracts';

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
    vatByContext: row.vatByContext,
    activeProductCount: row.activeProductCount,
  };
}

/**
 * Les taux saisis à l'écran, par clé de contexte. `''` = non réglé — c'est ce
 * que rend une liste déroulante vide, et la clé est **retirée** avant l'envoi
 * plutôt qu'envoyée à vide : « non réglé » ne s'écrit pas.
 */
export type CategoryVatDraft = Readonly<Record<string, string>>;

/** La famille telle que SA page la reçoit — socle, textes, visuels. */
export interface CategoryDetail extends Category {
  readonly editorial: CategoryDetailView['editorial'];
  readonly media: readonly CategoryMediaView[];
}

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

  /**
   * Une famille ENRICHIE — pour sa page. La liste ne porte ni textes ni visuels :
   * les y mettre coûterait une jointure par ligne sur la bibliothèque de médias,
   * pour des colonnes qu'aucune ligne n'affiche.
   */
  async detail(id: string): Promise<CategoryDetail> {
    const row = await firstValueFrom(
      this.http.get<CategoryDetailView>(this.url(`categories/${id}`)),
    );
    return { ...toCategory(row), editorial: row.editorial, media: [...row.media] };
  }

  create(payload: {
    name: LocalizedText;
    parentId?: string | undefined;
  }): Promise<CreatedIdResponse> {
    return firstValueFrom(
      this.http.post<CreatedIdResponse>(this.url('categories'), {
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
      vatByContext: settledOnly(ids),
    });
  }

  /** Les textes de la famille — les quatre champs partent ensemble. */
  setEditorial(id: string, editorial: CategoryEditorialPayload): Promise<void> {
    return this.put(`categories/${id}/editorial`, editorial);
  }

  /**
   * Les visuels : la liste ENTIÈRE, dans son ordre. Ce qu'on n'envoie pas est
   * détaché — c'est un remplacement, comme pour une fiche.
   *
   * Les faits techniques ne repartent PAS : le serveur les a mesurés au dépôt et
   * les relira lui-même. Un navigateur pourrait en dire autre chose.
   */
  setMedia(id: string, media: readonly CategoryMediaView[]): Promise<void> {
    return this.put(`categories/${id}/media`, {
      media: media.map((slot) => ({
        role: slot.role,
        url: slot.url,
        name: slot.name,
        ...(slot.alt === undefined ? {} : { alt: slot.alt }),
      })),
    });
  }

  /**
   * Dépose un fichier dans la BIBLIOTHÈQUE — pas sur une famille.
   *
   * La route est celle du catalogue, pas celle des fiches : un visuel existe
   * avant d'être attaché, et le même fichier sert une famille et une fiche sans
   * être déposé deux fois.
   */
  uploadMedia(file: File): Promise<UploadedMediaView> {
    const body = new FormData();
    body.append('file', file);
    return firstValueFrom(this.http.post<UploadedMediaView>(this.url('media'), body));
  }

  private async put(path: string, body: unknown): Promise<void> {
    await firstValueFrom(this.http.put(this.url(path), body));
  }

  private url(path: string): string {
    return `${this.base}/catalogue/${path}`;
  }
}
