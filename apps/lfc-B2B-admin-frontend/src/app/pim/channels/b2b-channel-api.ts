import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { B2bPushSummaryView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

export type {
  B2bExclusionReason,
  B2bExclusionView,
  B2bIngestionReportView,
  B2bPushSummaryView,
} from '@lfd/pim-contracts';

/**
 * Canal **boutique B2B** — pousse le catalogue vers la plateforme marchande.
 *
 * Le serveur décide seul entre simulation et envoi réel ; le front demande,
 * il ne simule rien. `dryRun` est **vrai par défaut côté serveur** : un bouton
 * qui pousse le catalogue vendu ne doit pas partir sur un appel mal formé.
 */
@Injectable({ providedIn: 'root' })
export class B2bChannelApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  push(dryRun: boolean): Promise<B2bPushSummaryView> {
    return firstValueFrom(
      // `base` porte déjà le préfixe `/pim` (cf. data/api.ts).
      this.http.post<B2bPushSummaryView>(`${this.base}/channels/b2b/push`, { dryRun }),
    );
  }
}
