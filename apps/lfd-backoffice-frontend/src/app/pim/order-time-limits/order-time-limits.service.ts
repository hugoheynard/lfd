import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  EffectiveOrderTimeLimitView,
  GeneralOrderCutoffView,
  OrderTimeLimitListItem,
  OrderTimeLimitPayload,
  SetOrderTimeLimitResponse,
} from '@lfd/pim-contracts';

import { API_BASE_URL } from '../data/api';

/**
 * **Points d'arrêt de prise de commande** — jusqu'à quand on accepte une
 * commande, sur un produit ou sur une famille.
 *
 * `PUT` sans identifiant, et c'est le serveur qui le veut : la **portée** est la
 * clé. Un écran qui pose « la viennoiserie ferme à 16 h » n'a pas à savoir si
 * quelqu'un l'a déjà posée — la question n'a aucun sens pour lui, et l'obliger à
 * y répondre le ferait se tromper une fois sur deux.
 */
@Injectable({ providedIn: 'root' })
export class OrderTimeLimitsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Les limites des produits et des familles, archivées comprises, avec leurs exclusions nommées. */
  async list(): Promise<readonly OrderTimeLimitListItem[]> {
    return firstValueFrom(this.http.get<readonly OrderTimeLimitListItem[]>(this.url()));
  }

  /** La limite effective d'un produit, sa provenance, et les limites de sa lignée. */
  async effective(productId: string): Promise<EffectiveOrderTimeLimitView> {
    return firstValueFrom(
      this.http.get<EffectiveOrderTimeLimitView>(
        `${this.url()}/effective/${encodeURIComponent(productId)}`,
      ),
    );
  }

  /** Exclut un produit de la limite d'une famille : elle ne le vise plus. */
  async exclude(limitId: string, productId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.url()}/${limitId}/exclusions`, { productId }),
    );
  }

  /** Réintègre un produit exclu : la limite de la famille le vise de nouveau. */
  async include(limitId: string, productId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${this.url()}/${limitId}/exclusions/${encodeURIComponent(productId)}`,
      ),
    );
  }

  /**
   * La règle générale du commerce, en lecture (2026-10-21) : « toute la
   * production » se règle dans Réglages › Commandes › Heure limite.
   */
  async general(): Promise<GeneralOrderCutoffView> {
    return firstValueFrom(this.http.get<GeneralOrderCutoffView>(`${this.url()}/general-cutoff`));
  }

  /** Crée ou remplace la règle de cette portée. Rend son identifiant. */
  async set(payload: OrderTimeLimitPayload): Promise<SetOrderTimeLimitResponse> {
    return firstValueFrom(this.http.put<SetOrderTimeLimitResponse>(this.url(), payload));
  }

  /** La route garde son `DELETE` : une limite ne se supprime plus, elle s'archive et cesse de s'appliquer. */
  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url()}/${id}`));
  }

  /** La remet en vigueur, avec les valeurs qu'elle portait. */
  async restore(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.url()}/${id}/restore`, {}));
  }

  private url(): string {
    return `${this.base}/order-time-limits`;
  }
}
