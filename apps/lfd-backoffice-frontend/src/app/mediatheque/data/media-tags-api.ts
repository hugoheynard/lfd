import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { MediaTagView, RenameMediaTagPayload } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/** **Le vocabulaire du fonds** — `/media/tags`. */
@Injectable({ providedIn: 'root' })
export class MediaTagsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/media/tags`;

  /**
   * Chaque mot-clé et combien d'images le portent, compté sur TOUT le fonds
   * (depuis le 2026-10-10). 🔴 Il remplace un vocabulaire dérivé des images
   * CHARGÉES, où un mot porté hors de la page n'apparaissait pas.
   */
  async tags(): Promise<readonly MediaTagView[]> {
    return firstValueFrom(this.http.get<readonly MediaTagView[]>(this.base));
  }

  /**
   * Renomme un mot-clé sur toutes les images qui le portent. Si `to` existe
   * déjà, c'est une **fusion** : le serveur ne la distingue pas, l'écran
   * l'annonce avant.
   */
  async renameTag(payload: RenameMediaTagPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/rename`, payload));
  }

  /** Retire un mot-clé de toutes les images. Les images restent au fonds. */
  async removeTag(tag: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(this.base, { params: { tag } }));
  }
}
