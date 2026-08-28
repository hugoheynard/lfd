import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { FooterContent, FooterContentView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Contenu de plateforme** — les textes de la vitrine.
 *
 * La lecture passe par la surface STAFF et non la publique, alors que les deux
 * rendent le même pied de page : seule la staff porte la révision et la
 * dernière main, et c'est précisément ce dont l'écran d'édition a besoin pour
 * dire à un rédacteur que quelqu'un a enregistré entre-temps.
 */
@Injectable({ providedIn: 'root' })
export class PlatformContentService {
  private readonly http = inject(HttpClient);

  /** Le pied de page, avec sa révision. Aboutit toujours (cf. l'API). */
  async footer(): Promise<FooterContentView> {
    return firstValueFrom(this.http.get<FooterContentView>(`${B2B_API_BASE}/admin/content/footer`));
  }

  /**
   * Enregistre le pied de page ENTIER, dans ses trois langues.
   *
   * `PUT` et non `PATCH` : un enregistrement partiel laisserait une langue en
   * arrière sans que rien ne le dise.
   */
  async saveFooter(content: FooterContent): Promise<FooterContentView> {
    return firstValueFrom(
      this.http.put<FooterContentView>(`${B2B_API_BASE}/admin/content/footer`, content),
    );
  }
}
