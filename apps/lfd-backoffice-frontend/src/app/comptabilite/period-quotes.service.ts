import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CompanyPeriodQuotesView,
  PeriodQuoteCommitmentPayload,
  PeriodQuoteCommitmentReceivedView,
  PeriodQuoteResentView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/**
 * **Les devis de période** d'un organisme public (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD7) : la liste d'une fiche client — celle du payeur —, le PDF
 * d'une version, et les deux gestes de la comptabilité, chacun sous la clé
 * d'intention de l'écran.
 */
@Injectable({ providedIn: 'root' })
export class PeriodQuotesService {
  private readonly http = inject(HttpClient);

  /** `GET admin/companies/:id/period-quotes` — ceux du payeur, même depuis un site. */
  async ofCompany(companyId: string): Promise<CompanyPeriodQuotesView> {
    return firstValueFrom(
      this.http.get<CompanyPeriodQuotesView>(
        `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/period-quotes`,
      ),
    );
  }

  /** `GET admin/period-quotes/:id/document` — 404 nommé tant que la version n'est pas rendue. */
  async document(quoteId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/period-quotes/${encodeURIComponent(quoteId)}/document`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * `POST admin/period-quotes/:id/resend` — la même version si ses commandes
   * n'ont pas changé, sinon une nouvelle ; rend la version envoyée.
   */
  async resend(quoteId: string, intentKey: string): Promise<PeriodQuoteResentView> {
    return firstValueFrom(
      this.http.post<PeriodQuoteResentView>(
        `${B2B_API_BASE}/admin/period-quotes/${encodeURIComponent(quoteId)}/resend`,
        {},
        intentOptions(intentKey),
      ),
    );
  }

  /** `POST admin/period-quotes/:id/commitment` — « Engagement reçu » ; rend la facture émise. */
  async receiveCommitment(
    quoteId: string,
    payload: PeriodQuoteCommitmentPayload,
    intentKey: string,
  ): Promise<PeriodQuoteCommitmentReceivedView> {
    return firstValueFrom(
      this.http.post<PeriodQuoteCommitmentReceivedView>(
        `${B2B_API_BASE}/admin/period-quotes/${encodeURIComponent(quoteId)}/commitment`,
        payload,
        intentOptions(intentKey),
      ),
    );
  }
}
