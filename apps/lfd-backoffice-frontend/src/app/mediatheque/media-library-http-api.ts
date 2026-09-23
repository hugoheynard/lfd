import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  MediaCarrierView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  UploadedMediaView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

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
 * ✅ Le préfixe `/pim` est tombé le 2026-09-23 : la bibliothèque est un bloc à
 * elle, et le préfixe disait dans quel bloc son code vivait.
 */
@Injectable({ providedIn: 'root' })
export class MediaLibraryHttpApi {
  private readonly http = inject(HttpClient);
  /**
   * 🔴 La RACINE, et plus le préfixe du référentiel. La médiathèque est un bloc
   * à elle depuis le 2026-09-23 : ses routes sont `/media`, pas `/pim/media`.
   * Le `/pim` disait dans quel bloc le code vivait ; il n'y vit plus.
   */
  private readonly base = B2B_API_BASE;

  /**
   * Une page de la bibliothèque, filtrée **au serveur**.
   *
   * 🔴 Au serveur depuis le 2026-09-23, et c'était un défaut avant d'être un
   * manque : les écrans filtraient ce qu'ils avaient chargé. Le sélecteur en
   * charge cent ; l'image cent-unième était donc introuvable quoi qu'on tape,
   * et rien ne le disait à l'écran.
   *
   * ⚠️ Les tags partent séparés par une VIRGULE, pas en paramètre répété :
   * `?tags=a&tags=b` rend une chaîne quand il y en a un et un tableau quand il
   * y en a deux, et une forme qui change selon le nombre d'éléments est la
   * source d'une classe de bugs qu'un test à un seul tag ne voit pas. Un tag
   * ne contient jamais de virgule — la normalisation d'écriture découpe
   * dessus.
   */
  async page(
    limit: number,
    offset: number,
    q = '',
    tags: readonly string[] = [],
  ): Promise<MediaLibraryPageView> {
    return firstValueFrom(
      this.http.get<MediaLibraryPageView>(`${this.base}/media`, {
        params: {
          limit: String(limit),
          offset: String(offset),
          // Un critère vide ne part PAS : envoyer `q=` ferait poser un filtre
          // qui n'en est pas un, et le serveur devrait le défaire.
          ...(q.trim() === '' ? {} : { q: q.trim() }),
          ...(tags.length === 0 ? {} : { tags: tags.join(',') }),
        },
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
    return firstValueFrom(this.http.post<UploadedMediaView>(`${this.base}/media`, body));
  }

  /**
   * **Qui affiche cette image** — nommés, pas comptés.
   *
   * 🔴 Distinct du `uses` que porte chaque entrée de la liste : celui-là est
   * un compte, obtenu en balayant des pages entières sans charger aucun
   * libellé. Celui-ci nomme les porteurs d'UNE image. Les deux peuvent
   * diverger le temps qu'une fiche change — d'où la règle d'écran : on
   * n'affiche pas les deux nombres côte à côte.
   */
  async carriersOf(url: string): Promise<readonly MediaCarrierView[]> {
    return firstValueFrom(
      this.http.get<readonly MediaCarrierView[]>(`${this.base}/media/carriers`, {
        params: { url },
      }),
    );
  }

  /**
   * Écrit ce qu'on a décidé d'une image : son étiquette, ses tags, son point.
   *
   * 🔴 Les trois partent ENSEMBLE, parce que le serveur écrit les trois. Poser
   * un tag en laissant `name` ou `focal` de côté les effacerait — c'est un
   * remplacement, pas une retouche. L'appelant renvoie donc ce qu'il a lu.
   *
   * ⚠️ Lecture-modification-écriture : deux personnes qui taguent la même image
   * en même temps, c'est la dernière qui gagne. Acceptable pour un mot-clé ; ça
   * ne le serait pas pour une donnée réglementaire.
   */
  async describe(details: MediaDetailsPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/media`, details));
  }

  /**
   * Retire une image de la bibliothèque — octets compris.
   *
   * 🔴 Le serveur REFUSE (409) si un porteur l'affiche, et son message dit
   * combien. L'écran n'a donc pas à décider : il propose, et rapporte le refus.
   * Décider ici ferait deux règles pour un seul fait, et celle de l'écran
   * vieillirait la première.
   */
  async discard(url: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/media`, { params: { url } }));
  }
}
