import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ActivationView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../../api/api-config';

/**
 * Lecture du **tunnel d'activation** (complétion / frictions / adoption+) dérivé
 * du journal — `GET /admin/activations`. Même auth staff que le reste de l'admin.
 */
@Injectable({ providedIn: 'root' })
export class ActivationsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly ActivationView[]> {
    return firstValueFrom(
      this.http.get<readonly ActivationView[]>(`${B2B_API_BASE}/admin/activations`),
    );
  }
}
