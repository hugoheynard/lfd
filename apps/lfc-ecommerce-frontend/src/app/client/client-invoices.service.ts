import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  IssuedInvoiceSummaryView,
  IssuedInvoiceView,
  IssuedInvoicesView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est la lecture de « Mes factures ». */
export type InvoicesReadStatus = 'loading' | 'failed' | 'ready';

/**
 * **Les factures de la société** — la section « Mes factures » de
 * `/mon-compte` (plan `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`,
 * E6). Des lectures seulement : une facture émise ne change plus.
 *
 * Une lecture partagée par les deux cartes (bureau et mobile, toutes deux
 * dans le DOM), comme `ClientBankAccount`. Paresseuse : seuls `owner` et
 * `billing` voient ces cartes, et l'API refuserait les autres. Le mur
 * (404 hors société, 403 autre rôle) est tenu par l'API.
 */
@Injectable({ providedIn: 'root' })
export class ClientInvoices {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly _status = signal<InvoicesReadStatus>('loading');
  private readonly _invoices = signal<readonly IssuedInvoiceSummaryView[]>([]);
  private readFor: string | null = null;

  readonly status = this._status.asReadonly();
  readonly invoices = this._invoices.asReadonly();

  /** Lit la liste si ce n'est pas déjà fait : la seconde carte ne relit pas. */
  ensure(companyId: string): void {
    if (this.readFor !== companyId) {
      void this.reload(companyId);
    }
  }

  /** Relit — après un échec (« Réessayer »). */
  async reload(companyId: string): Promise<void> {
    this.readFor = companyId;
    if (this._status() === 'failed') {
      this._status.set('loading');
    }
    try {
      const { invoices } = await firstValueFrom(
        this.http.get<IssuedInvoicesView>(this.url(companyId), { headers: await this.headers() }),
      );
      this._invoices.set(invoices);
      this._status.set('ready');
    } catch {
      this._status.set('failed');
    }
  }

  /** `GET /companies/:companyId/invoices/:invoiceId` — une pièce, rejetée en cas d'échec. */
  async one(companyId: string, invoiceId: string): Promise<IssuedInvoiceView> {
    return firstValueFrom(
      this.http.get<IssuedInvoiceView>(`${this.url(companyId)}/${encodeURIComponent(invoiceId)}`, {
        headers: await this.headers(),
      }),
    );
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/invoices`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
