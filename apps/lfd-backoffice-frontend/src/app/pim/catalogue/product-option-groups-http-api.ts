import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ActivateProductOptionGroupPayload, ProductOptionGroupView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * **Les options de commande d'une fiche** — leurs routes à elles, hors de
 * « Tout enregistrer » (`/pim/catalogue/products/:id/option-groups`).
 */
@Injectable({ providedIn: 'root' })
export class ProductOptionGroupsHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(productId: string): Promise<ProductOptionGroupView[]> {
    return firstValueFrom(this.http.get<ProductOptionGroupView[]>(this.url(productId)));
  }

  /** Pose l'activation entière : `variantIds: null` = toutes les déclinaisons. */
  async activate(
    productId: string,
    groupId: string,
    variantIds: readonly string[] | null,
  ): Promise<void> {
    const payload: ActivateProductOptionGroupPayload = {
      variantIds: variantIds === null ? null : [...variantIds],
    };
    await firstValueFrom(this.http.put(this.url(productId, groupId), payload));
  }

  async deactivate(productId: string, groupId: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(productId, groupId)));
  }

  private url(productId: string, groupId?: string): string {
    const root = `${this.base}/catalogue/products/${productId}/option-groups`;
    return groupId === undefined ? root : `${root}/${groupId}`;
  }
}
