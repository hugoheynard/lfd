import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { MediaLibraryPageView, UploadedMediaView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../pim/data/api';

/**
 * La **bibliothèque de visuels**, lue par la médiathèque.
 *
 * 🔴 Une image y apparaît une seule fois, quel qu'ait été son nombre
 * d'inscriptions : le serveur groupe par URL, parce que c'est la seule identité
 * qui traverse deux enregistrements de fiche. L'écran n'a donc rien à
 * dédoublonner — et ne doit surtout pas essayer, sinon deux règles de
 * groupement cohabiteraient sans jamais se croiser.
 *
 * Client posé hors de `pim/`, comme l'écran : la bibliothèque n'appartient à
 * aucun référentiel.
 *
 * ⚠️ La BASE d'URL reste celle du référentiel, et son `/pim` avec : ce préfixe
 * est monté par le BLOC, et le code de la bibliothèque y vit encore. Il tombera
 * au même déclencheur que le schéma Postgres — le premier visuel de vitrine
 * (cf. `plan-la-mediatheque.md` §3 bis). Le segment `catalogue/`, lui, est
 * déjà parti : il affirmait une propriété que le référentiel produit n'a pas.
 */
@Injectable({ providedIn: 'root' })
export class MediaLibraryHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async page(limit: number, offset: number): Promise<MediaLibraryPageView> {
    return firstValueFrom(
      this.http.get<MediaLibraryPageView>(`${this.base}/mediatheque`, {
        params: { limit: String(limit), offset: String(offset) },
      }),
    );
  }

  /**
   * Dépose UNE image et rend son entrée de bibliothèque.
   *
   * Un fichier par appel, et c'est le serveur qui le veut ainsi : la route
   * prend un `file` unique. Le dépôt en lot est donc une affaire d'écran — il
   * enchaîne, et rend compte fichier par fichier.
   *
   * 🔴 **Redéposer les mêmes octets est sans effet de bord** : la clé de
   * stockage est le SHA-256 du contenu, donc reprendre un lot à moitié échoué
   * ne duplique rien. C'est ce qui permet de proposer « réessayer » sans
   * précaution particulière.
   */
  async upload(file: File): Promise<UploadedMediaView> {
    const body = new FormData();
    body.append('file', file);
    return firstValueFrom(this.http.post<UploadedMediaView>(`${this.base}/mediatheque`, body));
  }
}
