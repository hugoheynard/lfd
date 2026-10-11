import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ImagePalette,
  LibraryMediaView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  MediaUploadFailureView,
  ReplaceMediaPayload,
  UploadedMediaView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { pageParams, type MediaPageRequest } from '../rules/media-page-request';

/**
 * **Les images du fonds** — `/media` : lire, déposer, décrire, remplacer,
 * retirer.
 *
 * 🔴 Une image y apparaît une seule fois, quel qu'ait été son nombre
 * d'inscriptions : le serveur groupe par URL, parce que c'est la seule identité
 * qui traverse deux enregistrements de fiche. L'écran n'a donc rien à
 * dédoublonner — et ne doit surtout pas essayer, sinon deux règles de
 * groupement cohabiteraient sans jamais se croiser.
 *
 * Client posé hors de `pim/`, comme l'écran : la bibliothèque n'appartient à
 * aucun référentiel, et ses routes sont `/media` depuis le 2026-09-23.
 */
@Injectable({ providedIn: 'root' })
export class MediaImagesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/media`;

  /**
   * Une page du fonds, filtrée et triée **au serveur** (2026-09-23) : filtrer
   * ce qu'on avait chargé rendait la cent-unième image introuvable.
   *
   * 🔴 Par CURSEUR depuis le 2026-10-10 : `after` reprend où `next` s'est
   * arrêté, et un dépôt pendant qu'on défile ne décale plus rien.
   */
  async page(request: MediaPageRequest): Promise<MediaLibraryPageView> {
    return firstValueFrom(
      this.http.get<MediaLibraryPageView>(this.base, { params: pageParams(request) }),
    );
  }

  /**
   * **UNE image**, par son URL — `GET /media/one`, la même vue qu'une ligne du
   * fil. 404 si elle n'est pas au fonds. Elle sert à qui écrit sans avoir
   * l'image sous les yeux (les outils agent) : {@link describe} remplace tout.
   */
  async one(url: string): Promise<LibraryMediaView> {
    return firstValueFrom(this.http.get<LibraryMediaView>(`${this.base}/one`, { params: { url } }));
  }

  /**
   * Dépose UNE image — la route prend un `file` unique, le lot est une affaire
   * d'écran. 🔴 Redéposer les mêmes octets est sans effet de bord (clé =
   * SHA-256 du contenu) : « réessayer » ne duplique rien.
   */
  async upload(
    file: File,
    seriesId: string | null = null,
    palette: ImagePalette | null = null,
  ): Promise<UploadedMediaView> {
    const body = new FormData();
    body.append('file', file);
    // La palette est calculée par le navigateur (`mediatheque.md` §9 bis) : l'API n'a pas de
    // décodeur. Absente, le serveur range `NULL` et le rattrapage la posera.
    if (palette !== null) body.append('palette', JSON.stringify(palette));
    // La série part avec CHAQUE fichier du lot (facultative, `mediatheque.md` §5). Une
    // image déjà au fonds garde la sienne : la réponse le dit.
    if (seriesId !== null) body.append('seriesId', seriesId);
    return firstValueFrom(this.http.post<UploadedMediaView>(this.base, body));
  }

  /**
   * Écrit étiquette, tags, alternative et point ENSEMBLE : c'est un
   * remplacement, pas une retouche — l'appelant renvoie ce qu'il a lu.
   * ⚠️ Lecture-modification-écriture : la dernière écriture gagne.
   */
  async describe(details: MediaDetailsPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.base, details));
  }

  /**
   * **Remplacer une image** chez tous ses porteurs (`mediatheque.md` §2) — 204.
   * L'ancienne RESTE au fonds ; la nouvelle garde sa propre description.
   * Refus nommés : 404, 400 (vide ou identique), 409 (révision de vitrine).
   */
  async replace(payload: ReplaceMediaPayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/replace`, payload));
  }

  /**
   * **Ce qui n'est PAS entré** — les derniers dépôts refusés. Il SURVIT au
   * rechargement ; ⚠️ il ne permet pas de rejouer (aucun octet stocké) : seule
   * la file en mémoire (`BatchUploadStore`) le peut.
   */
  async failures(limit = 50): Promise<readonly MediaUploadFailureView[]> {
    return firstValueFrom(
      this.http.get<readonly MediaUploadFailureView[]>(`${this.base}/failures`, {
        params: { limit: String(limit) },
      }),
    );
  }

  /**
   * Retire une image — octets compris. 🔴 Le serveur REFUSE (409) si un
   * porteur l'affiche : l'écran propose, et rapporte le refus.
   */
  async discard(url: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(this.base, { params: { url } }));
  }
}
