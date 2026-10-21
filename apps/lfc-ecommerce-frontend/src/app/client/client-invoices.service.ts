import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { IssuedInvoiceView, MyIssuedInvoicesView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { attachmentFileName } from './mes-factures/content-disposition';

/** Les filtres de la liste — année et mois d'ÉMISSION, type de pièce. */
export interface InvoiceFilters {
  readonly year: number | null;
  /** Ne se pose qu'avec une année : le serveur refuse un mois seul. */
  readonly month: number | null;
  readonly kind: 'invoice' | 'credit_note' | null;
}

/** Ce que le zip désigne : les pièces filtrées, ou une sélection — jamais les deux. */
export type InvoiceArchiveRequest =
  { readonly filters: InvoiceFilters } | { readonly ids: readonly string[] };

/** Un zip reçu, et le nom que le serveur lui donne. */
export interface InvoiceArchive {
  readonly fileName: string;
  readonly blob: Blob;
}

/** Le nom de repli, quand `Content-Disposition` n'est pas lisible. */
export const ARCHIVE_FALLBACK_NAME = 'factures.zip';

/**
 * Le serveur a refusé le zip. `message` est le sien — il nomme les pièces en
 * cause (plan `plan-page-mes-factures.md` §7.5) — ou `null` quand la réponse
 * n'en portait pas (réseau, panne).
 */
export class InvoiceArchiveRefused extends Error {
  constructor(readonly serverMessage: string | null) {
    super(serverMessage ?? 'zip refusé');
  }
}

/**
 * **Les factures de la société** — la page `/mes-factures` (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`). Des
 * lectures seulement : une facture émise ne change plus. Sans état : la page
 * tient sa liste, ses filtres et sa sélection.
 *
 * Le mur (404 hors société, 403 hors `owner|billing`) est tenu par l'API.
 */
@Injectable({ providedIn: 'root' })
export class ClientInvoices {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /** `GET /companies/:companyId/invoices?year&month&kind` — la liste filtrée et le total dû. */
  async list(companyId: string, filters: InvoiceFilters): Promise<MyIssuedInvoicesView> {
    return firstValueFrom(
      this.http.get<MyIssuedInvoicesView>(this.url(companyId), {
        headers: await this.headers(),
        params: filterParams(filters),
      }),
    );
  }

  /** `GET /companies/:companyId/invoices/:invoiceId` — une pièce, rejetée en cas d'échec. */
  async one(companyId: string, invoiceId: string): Promise<IssuedInvoiceView> {
    return firstValueFrom(
      this.http.get<IssuedInvoiceView>(`${this.url(companyId)}/${encodeURIComponent(invoiceId)}`, {
        headers: await this.headers(),
      }),
    );
  }

  /**
   * `GET …/invoices/:invoiceId/pdf` — le PDF/A-3 Factur-X rangé (E3b), en
   * **blob** : la route est authentifiée, un `<a href>` partirait sans jeton.
   */
  async document(companyId: string, invoiceId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.url(companyId)}/${encodeURIComponent(invoiceId)}/pdf`, {
        headers: await this.headers(),
        responseType: 'blob',
      }),
    );
  }

  /**
   * `GET …/invoices.zip` — entier ou refusé (P2) : le serveur ne sert jamais un
   * zip incomplet. Un refus lève {@link InvoiceArchiveRefused} avec SON message.
   */
  async archive(companyId: string, request: InvoiceArchiveRequest): Promise<InvoiceArchive> {
    const params =
      'ids' in request
        ? new HttpParams().set('ids', request.ids.join(','))
        : filterParams(request.filters);
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.url(companyId)}.zip`, {
          headers: await this.headers(),
          params,
          responseType: 'blob',
          observe: 'response',
        }),
      );
      return {
        fileName:
          attachmentFileName(response.headers.get('Content-Disposition')) ?? ARCHIVE_FALLBACK_NAME,
        blob: response.body ?? new Blob([]),
      };
    } catch (error) {
      throw new InvoiceArchiveRefused(await serverMessageOf(error));
    }
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/invoices`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

function filterParams(filters: InvoiceFilters): HttpParams {
  let params = new HttpParams();
  if (filters.year !== null) {
    params = params.set('year', String(filters.year));
    if (filters.month !== null) {
      params = params.set('month', String(filters.month));
    }
  }
  if (filters.kind !== null) {
    params = params.set('kind', filters.kind);
  }
  return params;
}

/**
 * Le `message` de l'enveloppe d'`AppErrorFilter`. Demandé en blob, le corps
 * d'erreur arrive en `Blob` lui aussi : il faut le relire en texte.
 */
async function serverMessageOf(error: unknown): Promise<string | null> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) {
    return null;
  }
  try {
    const body: unknown = JSON.parse(await error.error.text());
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body;
      return typeof message === 'string' && message !== '' ? message : null;
    }
    return null;
  } catch {
    return null;
  }
}
