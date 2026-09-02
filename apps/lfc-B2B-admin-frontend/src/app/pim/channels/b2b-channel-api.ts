import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { B2bProductDeliveryView, B2bPushSummaryView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

export type {
  B2bExclusionReason,
  B2bExclusionView,
  B2bIngestionReportView,
  B2bPushSummaryView,
  B2bDeliveryFactsView,
  B2bProductDeliveryView,
} from '@lfd/pim-contracts';

/**
 * Canal **boutique B2B** — pousse le catalogue vers la plateforme marchande.
 *
 * Le serveur décide seul entre simulation et envoi réel ; le front demande,
 * il ne simule rien. `dryRun` est **vrai par défaut côté serveur** : un bouton
 * qui pousse le catalogue vendu ne doit pas partir sur un appel mal formé.
 */
@Injectable({ providedIn: 'root' })
export class B2bChannelApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * @param fingerprint l'empreinte rendue par la simulation qu'on vient de lire.
   *   Le serveur refuse en `409` si le catalogue a bougé depuis — c'est ce qui
   *   empêche d'envoyer autre chose que ce qui a été relu. Omise en simulation :
   *   c'est elle qui la produit.
   */
  push(dryRun: boolean, fingerprint?: string): Promise<B2bPushSummaryView> {
    return firstValueFrom(
      // `base` porte déjà le préfixe `/pim` (cf. data/api.ts).
      this.http.post<B2bPushSummaryView>(`${this.base}/channels/b2b/push`, {
        dryRun,
        ...(fingerprint === undefined ? {} : { fingerprint }),
      }),
    );
  }

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
}
