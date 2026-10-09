import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { RequestKind, RequestReasonPayload, RequestReasonView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les motifs des demandes clients** — ce que le client choisit en écrivant
 * (« Nous écrire ») ou en signalant un problème de commande, par `kind`
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.4).
 *
 * Le `kind` d'un motif ne change pas : le serveur refuse sa révision.
 */
@Injectable({ providedIn: 'root' })
export class RequestReasonsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/request-reasons`;

  list(kind: RequestKind): Promise<RequestReasonView[]> {
    return firstValueFrom(this.http.get<RequestReasonView[]>(this.base, { params: { kind } }));
  }

  create(payload: RequestReasonPayload): Promise<void> {
    return firstValueFrom(this.http.post<unknown>(this.base, payload)).then(() => undefined);
  }

  update(id: string, payload: RequestReasonPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/${encodeURIComponent(id)}`, payload));
  }

  archive(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/${encodeURIComponent(id)}/archive`, null),
    );
  }
}
