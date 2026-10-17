import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  B2bMembershipBatchResult,
  B2bMembershipView,
  B2bProductDeliveryView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

export type {
  B2bExclusionReason,
  B2bDeliveryFactsView,
  B2bProductDeliveryView,
  B2bMembershipView,
} from '@lfd/pim-contracts';

/**
 * Canal **boutique B2B** — l'appartenance des fiches au canal, et la frise
 * d'une fiche. Le push et son aperçu sont partis en X2 (2026-10-17) : les
 * faits du catalogue partent d'eux-mêmes.
 */
@Injectable({ providedIn: 'root' })
export class B2bChannelApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * **Où en est cette fiche sur la plateforme** : la décision, l'envoi,
   * l'acceptation.
   *
   * Un appel à part, et pas un champ de plus sur le détail produit : il
   * interroge l'AUTRE contexte à travers un port, donc il a son propre coût et
   * son propre mode de défaillance. Le greffer sur la fiche ferait tomber
   * l'édition d'un produit le jour où la plateforme répond mal.
   */
  delivery(productId: string): Promise<B2bProductDeliveryView> {
    return firstValueFrom(
      this.http.get<B2bProductDeliveryView>(
        `${this.base}/channels/b2b/products/${productId}/delivery`,
      ),
    );
  }

  /**
   * **Qui est vendu aux professionnels** — l'appartenance au canal, fiche par
   * fiche.
   *
   * 🔴 À ne pas confondre avec la matrice des contextes de vente, qui s'édite
   * dans la fiche : celle-là dit **où** un article se vend, celle-ci dit **si le
   * canal l'emporte**. La projection exige les DEUX, et c'est ce qui a rendu
   * l'absence invisible — on réglait celle qu'on voyait, et rien ne partait.
   */
  memberships(): Promise<B2bMembershipView[]> {
    return firstValueFrom(this.http.get<B2bMembershipView[]>(`${this.base}/channels/b2b/products`));
  }

  /**
   * Ouvre ou ferme le canal pour une fiche.
   *
   * Idempotent côté serveur : rouvrir ne réécrit ni la date d'origine ni
   * l'auteur — c'est la PREMIÈRE ouverture qui répond à « depuis quand ».
   */
  async setMembership(productId: string, published: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.base}/channels/b2b/products/${productId}`, { published }),
    );
  }

  /**
   * La même bascule, **en lot** — ouvrir un canal se fait une fois, sur tout un
   * catalogue. Les identifiants restent explicites : pas de « tout ouvrir »
   * magique qui emporterait un brouillon oublié.
   */
  async setMemberships(productIds: readonly string[], published: boolean): Promise<number> {
    const { affected } = await firstValueFrom(
      this.http.put<B2bMembershipBatchResult>(`${this.base}/channels/b2b/products`, {
        productIds: [...productIds],
        published,
      }),
    );
    return affected;
  }
}
