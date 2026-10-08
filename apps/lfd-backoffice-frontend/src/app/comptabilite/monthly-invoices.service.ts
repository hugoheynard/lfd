import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  IssueMonthlyInvoicesPayload,
  MonthlyInvoiceReportView,
  MonthlyInvoicesView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La facture du mois** (plan `documentation/facturation/plan-emission-de-la-facture.md`,
 * lot E4) : ce que l'écran « Prélèvement du mois » en lit, et le bouton
 * « Émettre les factures de … » (`b2b_accounting:write`) — la même commande
 * que le passage automatique du dernier jour, 22h.
 */
@Injectable({ providedIn: 'root' })
export class MonthlyInvoicesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/monthly-invoices`;

  async month(legalEntityId: string): Promise<MonthlyInvoicesView> {
    return firstValueFrom(
      this.http.get<MonthlyInvoicesView>(this.base, { params: { legalEntityId } }),
    );
  }

  /** Rejouable : un payeur déjà facturé pour le mois ne l'est pas deux fois. */
  async issue(payload: IssueMonthlyInvoicesPayload): Promise<MonthlyInvoiceReportView> {
    return firstValueFrom(this.http.post<MonthlyInvoiceReportView>(this.base, payload));
  }
}
