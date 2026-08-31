import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreatedIdResponse } from '@lfd/contracts';
import type {
  AllergenCategoryAdminView,
  CreateAllergenCategoryPayload,
  CreateAllergenEntryPayload,
  MoveAllergenCategoryPayload,
  RenameAllergenCategoryPayload,
  ReviseAllergenEntryPayload,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Le référentiel allergènes **tel qu'on l'administre** — `/pim/allergens`.
 *
 * ⚠️ Ce n'est pas `ReferenceApi`, et les confondre casserait l'écran. Celui-là
 * sert `/pim/reference/allergens`, le catalogue de **saisie** : il filtre le
 * périmètre réglementaire et **omet les archivés**. Ici on lit le référentiel
 * ENTIER, `archivedAt` compris — c'est le seul écran d'où l'on restaure, et une
 * ligne qu'on ne voit pas est une ligne qu'on ne peut plus remettre.
 *
 * Un client par question, donc, plutôt qu'un paramètre de plus sur le premier :
 * les deux répondent à « qu'est-ce que je peux cocher » et « qu'est-ce que le
 * référentiel contient », et ces deux réponses ne coïncident pas.
 */
@Injectable({ providedIn: 'root' })
export class AllergenHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Le catalogue entier, catégories et entrées cousues, archivés compris. */
  list(): Promise<AllergenCategoryAdminView[]> {
    return firstValueFrom(this.http.get<AllergenCategoryAdminView[]>(this.url()));
  }

  createCategory(payload: CreateAllergenCategoryPayload): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.url('categories'), payload));
  }

  async renameCategory(id: string, payload: RenameAllergenCategoryPayload): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`categories/${id}/name`), payload));
  }

  /** Le seul geste qu'une catégorie officielle accepte : ranger, pas réécrire. */
  async moveCategory(id: string, payload: MoveAllergenCategoryPayload): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`categories/${id}/position`), payload));
  }

  async archiveCategory(id: string): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`categories/${id}/archive`), {}));
  }

  async restoreCategory(id: string): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`categories/${id}/restore`), {}));
  }

  createEntry(payload: CreateAllergenEntryPayload): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.url('entries'), payload));
  }

  async reviseEntry(id: string, payload: ReviseAllergenEntryPayload): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`entries/${id}`), payload));
  }

  async archiveEntry(id: string): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`entries/${id}/archive`), {}));
  }

  async restoreEntry(id: string): Promise<void> {
    await firstValueFrom(this.http.put(this.url(`entries/${id}/restore`), {}));
  }

  private url(path = ''): string {
    return path === '' ? `${this.base}/allergens` : `${this.base}/allergens/${path}`;
  }
}
