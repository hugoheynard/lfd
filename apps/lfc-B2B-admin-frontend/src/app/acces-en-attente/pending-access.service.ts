import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import type { PendingAccess } from './pending-access.model';

/** La file des accès à remettre, et la fabrique de liens. */
@Injectable({ providedIn: 'root' })
export class PendingAccessService {
  private readonly http = inject(HttpClient);

  list(): Promise<readonly PendingAccess[]> {
    return firstValueFrom(
      this.http.get<readonly PendingAccess[]>(`${B2B_API_BASE}/admin/access-pending`),
    );
  }

  /**
   * Fabrique un lien **frais**. `POST` et non `GET` : ça crée un porteur de
   * droits à usage unique, et un `GET` finirait préchargé, mis en cache et
   * rangé dans l'historique du navigateur.
   */
  async issueLink(userId: string): Promise<string> {
    const { url } = await firstValueFrom(
      this.http.post<{ url: string }>(`${B2B_API_BASE}/admin/access-pending/${userId}/link`, {}),
    );
    return url;
  }
}
