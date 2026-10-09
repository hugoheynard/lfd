import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { IssuedInvoiceView, IssuedInvoicesView, OrderInvoicesView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **factures émises** (plan `documentation/comptabilite/facturation/facture-emise.md`) : celles d'une société pour l'onglet « Facturation » de sa fiche, et
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

  /**
   * `GET admin/accounting/orders/:id/invoices` — la facture et les avoirs qui
   * portent une commande (lot E5c), pour sa fiche.
   */
  async ofOrder(orderId: string): Promise<OrderInvoicesView> {
    return firstValueFrom(
      this.http.get<OrderInvoicesView>(
        `${B2B_API_BASE}/admin/accounting/orders/${encodeURIComponent(orderId)}/invoices`,
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

  /**
   * `GET admin/accounting/invoices/:id/pdf` — le PDF/A-3 Factur-X rangé
   * (E3b). 404 tant que le rendu n'est pas fait.
   */
  async document(invoiceId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${B2B_API_BASE}/admin/accounting/invoices/${encodeURIComponent(invoiceId)}/pdf`,
        { responseType: 'blob' },
      ),
    );
  }

  /**
   * `POST admin/accounting/invoices/:id/resend-notice` — renvoie l'e-mail
   * « Votre facture » (E6, suite (b)), `b2b_accounting:write`. 409 nommé si
   * personne n'est joignable ou si le fournisseur refuse.
   */
  async resendNotice(invoiceId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${B2B_API_BASE}/admin/accounting/invoices/${encodeURIComponent(invoiceId)}/resend-notice`,
        {},
      ),
    );
  }
}
