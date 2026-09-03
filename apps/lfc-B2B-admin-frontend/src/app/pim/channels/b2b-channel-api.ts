import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { B2bPushPreviewView } from '@lfd/contracts';
import type {
  B2bMembershipBatchResult,
  B2bMembershipView,
  B2bProductDeliveryView,
  B2bPushSummaryView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { API_BASE_URL } from '../data/api';

export type { B2bPushPreviewItem, B2bPushPreviewView } from '@lfd/contracts';
export type {
  B2bExclusionReason,
  B2bExclusionView,
  B2bIngestionReportView,
  B2bPushSummaryView,
  B2bDeliveryFactsView,
  B2bProductDeliveryView,
  B2bMembershipView,
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
   * **Ce que l'envoi ferait, s'il partait maintenant** — une LECTURE.
   *
   * Servie par la plateforme (`admin/catalog`) et non par le référentiel, parce
   * qu'elle a besoin des deux côtés : la projection du PIM et l'état du canal.
   * La frontière l'impose — `pim` ne lit jamais `b2b`, alors que `b2b` lit un
   * port publié par `pim`. C'est déjà le chemin qu'emprunte le contrôle de
   * parité.
   *
   * Elle remplace le clic « Simuler » : celui-ci appelait `push({dryRun:true})`,
   * qui traverse la tuyauterie d'envoi et **pose une ancre de révision** à
   * chaque regard.
   */
  preview(): Promise<B2bPushPreviewView> {
    return firstValueFrom(
      this.http.get<B2bPushPreviewView>(`${B2B_API_BASE}/admin/catalog/push-preview`),
    );
  }

  /**
   * @param fingerprint l'empreinte rendue par l'aperçu qu'on vient de lire.
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
