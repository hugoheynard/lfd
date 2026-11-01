import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  PostDeployApplyBody,
  PostDeployOverview,
  PostDeployRunStarted,
  PostDeployRunView,
} from '@lfd/ops-contract';

import { B2B_API_BASE } from '../api/api-config';

const BASE = `${B2B_API_BASE}/admin/ops/post-deploy`;

/**
 * Les opérations après déploiement, telles que l'API les rend
 * (`documentation/ops/plan-operations-apres-deploiement.md`). Aucun jugement
 * ici : « à faire », « bloquée » et la fenêtre d'application sont décidés
 * côté serveur.
 */
@Injectable({ providedIn: 'root' })
export class PostDeployService {
  private readonly http = inject(HttpClient);

  /** ⚠️ Simule chaque opération en direct : à ne pas appeler à chaque navigation. */
  overview(): Promise<PostDeployOverview> {
    return firstValueFrom(this.http.get<PostDeployOverview>(BASE));
  }

  simulate(key: string): Promise<PostDeployRunStarted> {
    return firstValueFrom(
      this.http.post<PostDeployRunStarted>(`${BASE}/${encodeURIComponent(key)}/simulate`, {}),
    );
  }

  apply(key: string): Promise<PostDeployRunStarted> {
    const body: PostDeployApplyBody = { acknowledged: true };
    return firstValueFrom(
      this.http.post<PostDeployRunStarted>(`${BASE}/${encodeURIComponent(key)}/apply`, body),
    );
  }

  run(runId: string): Promise<PostDeployRunView> {
    return firstValueFrom(
      this.http.get<PostDeployRunView>(`${BASE}/runs/${encodeURIComponent(runId)}`),
    );
  }
}
