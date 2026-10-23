import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CustomerRequestStatus,
  CustomerRequestView,
  OrderChangeAppliedResponse,
  OrderChangeRefusalPayload,
  OrderRevisionQuoteView,
  RequestKind,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les demandes clients** — messages « Nous écrire » et problèmes de
 * commande, dans une même boîte (`demandes-clients.md`, §3.3, §7).
 *
 * L'ordre est celui de l'API (à traiter : urgentes d'abord) ; aucun écran ne
 * le refait. Les photos ne sont jamais publiques : elles passent par la route
 * admin, gardée, et arrivent en `Blob`.
 */
@Injectable({ providedIn: 'root' })
export class CustomerRequestsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/customer-requests`;

  /** Sans `kind` : tous les types — c'est le compte du menu. */
  list(status: CustomerRequestStatus, kind?: RequestKind): Promise<CustomerRequestView[]> {
    const params: Record<string, string> = kind === undefined ? { status } : { status, kind };
    return firstValueFrom(this.http.get<CustomerRequestView[]>(this.base, { params }));
  }

  /** Un second traitement est refusé (409, message nommé par le serveur). */
  markHandled(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/${encodeURIComponent(id)}/handled`, null),
    );
  }

  /**
   * Le devis d'une demande de modification en attente — l'écart entre la
   * commande et la commande demandée. `409` avec la phrase de la règle quand
   * elle ne se modifie plus (inscrite au plan, carte…).
   */
  orderChangeQuote(id: string): Promise<OrderRevisionQuoteView> {
    return firstValueFrom(this.http.get<OrderRevisionQuoteView>(`${this.orderChange(id)}/quote`));
  }

  /** Applique la modification demandée : une révision au nom de l'équipe. Rend la révision produite. */
  applyOrderChange(id: string): Promise<OrderChangeAppliedResponse> {
    return firstValueFrom(
      this.http.post<OrderChangeAppliedResponse>(`${this.orderChange(id)}/apply`, null),
    );
  }

  /** Refuse la modification demandée, avec le mot adressé au client. */
  refuseOrderChange(id: string, reason: string): Promise<void> {
    const body: OrderChangeRefusalPayload = { reason };
    return firstValueFrom(this.http.post<void>(`${this.orderChange(id)}/refuse`, body));
  }

  private orderChange(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}/order-change`;
  }

  photo(requestId: string, photoId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${this.base}/${encodeURIComponent(requestId)}/photos/${encodeURIComponent(photoId)}`,
        { responseType: 'blob' },
      ),
    );
  }
}
