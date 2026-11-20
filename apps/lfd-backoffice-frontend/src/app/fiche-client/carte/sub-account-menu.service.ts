import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { SubAccountMenuPayload, SubAccountMenuView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

/**
 * **La carte d'un sous-compte**, côté staff (`/admin/companies/:id/menu`, sous
 * `b2b_companies`). Le `PUT` pose la carte entière sous la clé d'intention de
 * l'écran (`Idempotency-Key`, obligatoire) : la même clé sur une autre carte
 * est refusée (409), d'où une clé par brouillon.
 */
@Injectable({ providedIn: 'root' })
export class SubAccountMenuService {
  private readonly http = inject(HttpClient);

  /** `menu` vaut `null` tant qu'aucune carte n'est posée. */
  read(companyId: string): Promise<SubAccountMenuView> {
    return firstValueFrom(this.http.get<SubAccountMenuView>(this.url(companyId)));
  }

  /** `204` ; `409` sur une société sans principal. Un refus est relancé. */
  async save(companyId: string, payload: SubAccountMenuPayload, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.put<null>(this.url(companyId), payload, intentOptions(intentKey)),
    );
  }

  private url(companyId: string): string {
    return `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/menu`;
  }
}
