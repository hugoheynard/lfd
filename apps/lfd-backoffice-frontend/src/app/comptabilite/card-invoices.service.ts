import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CardInvoiceRetryView, CardInvoiceSignalsView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La facture carte** (plan `documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`,
 * lot E5a) : les factures signalées, et « Réessayer » (`b2b_accounting:write`)
 * — la même commande que les abonnés du retrait et de l'encaissement.
 */
@Injectable({ providedIn: 'root' })
export class CardInvoicesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/card-invoices`;

  async signals(): Promise<CardInvoiceSignalsView> {
    return firstValueFrom(this.http.get<CardInvoiceSignalsView>(`${this.base}/signals`));
  }

  /** Sans effet sur une commande déjà facturée : le compte rendu le dit. */
  async retry(orderId: string): Promise<CardInvoiceRetryView> {
    return firstValueFrom(
      this.http.post<CardInvoiceRetryView>(`${this.base}/${encodeURIComponent(orderId)}/retry`, {}),
    );
  }
}
