import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProspectView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Lecture des **prospects** (hot/mid) dérivés du journal — `GET /admin/prospects`.
 * Même auth staff que le reste de l'admin (token relayé par le shell ; `null` en
 * dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class ProspectsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly ProspectView[]> {
    return firstValueFrom(
      this.http.get<readonly ProspectView[]>(`${B2B_API_BASE}/admin/prospects`),
    );
  }
}
