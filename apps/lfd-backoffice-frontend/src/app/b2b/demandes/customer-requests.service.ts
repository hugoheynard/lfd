import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CustomerRequestStatus, CustomerRequestView, RequestKind } from '@lfd/contracts';
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

  photo(requestId: string, photoId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${this.base}/${encodeURIComponent(requestId)}/photos/${encodeURIComponent(photoId)}`,
        { responseType: 'blob' },
      ),
    );
  }
}
