import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PendingAlertCounts } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Combien d'alertes **attendent** sur chaque compte — la pastille de la liste.
 *
 * Une lecture agrégée, pas une par ligne : la liste est cross-tenant, et
 * interroger chaque compte ferait autant d'allers-retours que de sociétés.
 *
 * Les comptes sans alerte en attente ne sont **pas** dans la réponse : l'absence
 * vaut zéro. C'est ce qui garde la charge proportionnelle à ce qui demande une
 * action, pas au nombre de clients.
 */
@Injectable({ providedIn: 'root' })
export class PendingAlertsService {
  private readonly http = inject(HttpClient);

  counts(): Promise<PendingAlertCounts> {
    return firstValueFrom(
      this.http.get<PendingAlertCounts>(`${B2B_API_BASE}/admin/alerts/pending`),
    );
  }
}
