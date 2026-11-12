import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  RecordBankTransferPayload,
  RecordedBankTransferView,
  UnpaidTransferInvoicesView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/** Restreindre la liste : à une entité, à un payeur, aux seules factures en retard. */
export interface UnpaidTransferFilter {
  readonly legalEntityId?: string;
  readonly payerCompanyId?: string;
  readonly overdueOnly?: boolean;
}

/**
 * **Le virement reçu et les factures au virement à régler** (plan
 * `plan-paiement-au-compte-par-virement.md`, V7, V8). Lire : la comptabilité
 * ou la fiche client ; saisir un virement : `b2b_accounting:write`.
 */
@Injectable({ providedIn: 'root' })
export class BankTransfersService {
  private readonly http = inject(HttpClient);

  /** `GET admin/accounting/transfer-invoices/unpaid` — les plus en retard d'abord. */
  async unpaid(filter: UnpaidTransferFilter): Promise<UnpaidTransferInvoicesView> {
    let params = new HttpParams();
    if (filter.legalEntityId !== undefined) {
      params = params.set('legalEntityId', filter.legalEntityId);
    }
    if (filter.payerCompanyId !== undefined) {
      params = params.set('payerCompanyId', filter.payerCompanyId);
    }
    if (filter.overdueOnly === true) {
      params = params.set('overdue', 'true');
    }
    return firstValueFrom(
      this.http.get<UnpaidTransferInvoicesView>(
        `${B2B_API_BASE}/admin/accounting/transfer-invoices/unpaid`,
        { params },
      ),
    );
  }

  /**
   * `POST admin/accounting/legal-entities/:id/bank-transfers` — 409 rédigé par
   * le serveur pour un écart (en euros), une facture déjà réglée ou qui n'est
   * pas au virement.
   */
  async record(
    legalEntityId: string,
    payload: RecordBankTransferPayload,
    intentKey: string,
  ): Promise<RecordedBankTransferView> {
    return firstValueFrom(
      this.http.post<RecordedBankTransferView>(
        `${B2B_API_BASE}/admin/accounting/legal-entities/${encodeURIComponent(legalEntityId)}/bank-transfers`,
        payload,
        intentOptions(intentKey),
      ),
    );
  }
}
