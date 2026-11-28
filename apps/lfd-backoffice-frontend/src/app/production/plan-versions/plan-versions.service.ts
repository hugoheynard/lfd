import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DossierDispatchView, PlanVersionDiffView, PlanVersionView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les versions du plan d'une journée** (`documentation/fournil/plan-historique-des-tirages.md`) :
 * la liste, la comparaison de deux versions et ce que chaque destinataire du
 * dossier a reçu. Des lectures seulement.
 */
@Injectable({ providedIn: 'root' })
export class PlanVersionsService {
  private readonly http = inject(HttpClient);

  private versionsUrl(date: string): string {
    return `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/plan-versions`;
  }

  /** Les versions de la journée (`AAAA-MM-JJ`), de la première à la dernière ; vide sans version. */
  async list(date: string): Promise<readonly PlanVersionView[]> {
    return firstValueFrom(this.http.get<readonly PlanVersionView[]>(this.versionsUrl(date)));
  }

  /** Ce qui a changé de `from` à `to` ; 400 si `from > to`, 404 sur une version inconnue. */
  async compare(date: string, from: number, to: number): Promise<PlanVersionDiffView> {
    const params = new HttpParams().set('from', from).set('to', to);
    return firstValueFrom(
      this.http.get<PlanVersionDiffView>(`${this.versionsUrl(date)}/compare`, { params }),
    );
  }

  /** Les destinataires du dossier, et la dernière version que chacun a reçue. */
  async dispatches(date: string): Promise<readonly DossierDispatchView[]> {
    return firstValueFrom(
      this.http.get<readonly DossierDispatchView[]>(`${this.versionsUrl(date)}/dispatches`),
    );
  }
}
