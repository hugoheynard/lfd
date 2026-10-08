import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { IssuedInvoiceView, IssuedInvoicesView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **factures émises** (plan `documentation/facturation/plan-emission-de-la-facture.md`,
 * E6) : celles d'une société pour l'onglet « Facturation » de sa fiche, et
 * une pièce pour la comptabilité. Une relecture : une pièce émise ne change
 * plus.
 */
@Injectable({ providedIn: 'root' })
export class IssuedInvoicesService {
  private readonly http = inject(HttpClient);

  async ofCompany(companyId: string): Promise<IssuedInvoicesView> {
    return firstValueFrom(
      this.http.get<IssuedInvoicesView>(
        `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/invoices`,
      ),
    );
  }

  async one(invoiceId: string): Promise<IssuedInvoiceView> {
    return firstValueFrom(
      this.http.get<IssuedInvoiceView>(
        `${B2B_API_BASE}/admin/accounting/invoices/${encodeURIComponent(invoiceId)}`,
      ),
    );
  }
}
