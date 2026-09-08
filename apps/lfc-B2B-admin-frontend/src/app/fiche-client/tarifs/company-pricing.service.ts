import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AffectedRulesResponse,
  CloseCompanyMercurialePayload,
  CompanyPricingView,
  PoseCompanyMercurialePayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La tarification d'un compte** — ce qu'il paie, et ce qu'on lui pose.
 *
 * Les trois appels visent la surface `b2b_pricing` et non `b2b_companies` : la
 * fiche s'ouvre avec le second, que portent aussi la comptabilité et le
 * support, et brancher les prix négociés dessus les leur donnerait. L'onglet est
 * donc caché à qui n'a pas le droit de la tarification — personne ne gagne un
 * accès, personne n'en perd.
 */
@Injectable({ providedIn: 'root' })
export class CompanyPricingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/companies`;

  private path(companyId: string, suffix = ''): string {
    return `${this.base}/${encodeURIComponent(companyId)}${suffix}`;
  }

  /** Ce que ce client paie **aujourd'hui**, et ses mercuriales. */
  async read(companyId: string): Promise<CompanyPricingView> {
    return firstValueFrom(this.http.get<CompanyPricingView>(this.path(companyId)));
  }

  /** Rend le nombre de règles écrites — une ligne, une règle. */
  async pose(
    companyId: string,
    payload: PoseCompanyMercurialePayload,
  ): Promise<AffectedRulesResponse> {
    return firstValueFrom(
      this.http.post<AffectedRulesResponse>(this.path(companyId, '/mercuriale'), payload),
    );
  }

  /**
   * Clore une mercuriale en cours. `POST` et non `DELETE` : rien n'est supprimé,
   * ses règles sont archivées et une lecture datée d'avant les retrouve.
   */
  async close(
    companyId: string,
    payload: CloseCompanyMercurialePayload,
  ): Promise<AffectedRulesResponse> {
    return firstValueFrom(
      this.http.post<AffectedRulesResponse>(this.path(companyId, '/mercuriale/close'), payload),
    );
  }
}
