import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  FooterContent,
  FooterContentView,
  SalesTermsHeading,
  SalesTermsParagraphCreated,
  SalesTermsParagraphPayload,
  SalesTermsView,
} from '@lfd/contracts';
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

  /** Les CGV, avec leur révision. Aboutit toujours — le serveur sert le
   *  document de départ tant que personne n'a enregistré. */
  async salesTerms(): Promise<SalesTermsView> {
    return firstValueFrom(
      this.http.get<SalesTermsView>(`${B2B_API_BASE}/admin/content/sales-terms`),
    );
  }

  /**
   * Renomme le document, dans les trois langues.
   *
   * ⚠️ Rend `void`, comme toutes les écritures des CGV : une commande ne rend
   * pas de modèle de lecture. L'écran RELIT derrière, plutôt que de recoudre
   * une vue de son côté — c'est la seule façon qu'il voie aussi ce qu'un autre
   * rédacteur a enregistré entre-temps.
   */
  async renameSalesTerms(title: SalesTermsHeading): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/content/sales-terms/title`, title),
    );
  }

  /** Ajoute un article, dans les trois langues. Rend son identifiant — le seul
   *  retour qu'une commande se permet, parce que rien d'autre ne le donne. */
  async addSalesTermsParagraph(
    payload: SalesTermsParagraphPayload,
  ): Promise<SalesTermsParagraphCreated> {
    return firstValueFrom(
      this.http.post<SalesTermsParagraphCreated>(
        `${B2B_API_BASE}/admin/content/sales-terms/paragraphs`,
        payload,
      ),
    );
  }

  /** Réécrit un article ENTIER — les trois langues, celles qu'on ne touche pas
   *  comprises : la route remplace la charge utile, elle ne la rapièce pas. */
  async editSalesTermsParagraph(
    paragraphId: string,
    payload: SalesTermsParagraphPayload,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/content/sales-terms/paragraphs/${encodeURIComponent(paragraphId)}`,
        payload,
      ),
    );
  }

  /** Retire un article du document. */
  async removeSalesTermsParagraph(paragraphId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${B2B_API_BASE}/admin/content/sales-terms/paragraphs/${encodeURIComponent(paragraphId)}`,
      ),
    );
  }

  /** Déplace un article au rang demandé, compté à partir de zéro. */
  async moveSalesTermsParagraph(paragraphId: string, position: number): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/content/sales-terms/paragraphs/${encodeURIComponent(paragraphId)}/position`,
        { position },
      ),
    );
  }
}
