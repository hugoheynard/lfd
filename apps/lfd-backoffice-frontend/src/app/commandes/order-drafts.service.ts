import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderDraftPayload, OrderDraftResponse, OrderDraftView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **brouillons de commande** du back-office — la saisie qu'on met de côté.
 *
 * Un brouillon **par société**, partagé par l'équipe : c'est le compte qu'on
 * sert, et un commercial qui reprend l'appel d'un collègue doit retrouver ce qui
 * a été saisi. La contrepartie est assumée côté serveur — la dernière écriture
 * gagne — et l'écran dit qui a enregistré.
 *
 * `PUT` et non `POST` : l'écriture **remplace** l'unique brouillon de la
 * société ; la rejouer deux fois n'en crée pas deux.
 */
@Injectable({ providedIn: 'root' })
export class OrderDraftsService {
  private readonly http = inject(HttpClient);

  /** Le brouillon de cette société, ou `null`. */
  async find(companyId: string): Promise<OrderDraftView | null> {
    const response = await firstValueFrom(
      this.http.get<OrderDraftResponse>(`${B2B_API_BASE}/admin/order-drafts/${companyId}`),
    );
    return response.draft;
  }

  /** Met la saisie de côté et rend ce qui a été enregistré (date, auteur). */
  async save(companyId: string, payload: OrderDraftPayload): Promise<OrderDraftView> {
    return firstValueFrom(
      this.http.put<OrderDraftView>(`${B2B_API_BASE}/admin/order-drafts/${companyId}`, payload),
    );
  }

  /** Jette le brouillon. Idempotent côté serveur. */
  async discard(companyId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/order-drafts/${companyId}`));
  }
}
