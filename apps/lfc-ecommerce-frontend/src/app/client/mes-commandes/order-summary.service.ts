import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CompanyOrderSummaryRequest, CompanyOrderSummaryView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { attachmentFileName } from '../mes-factures/content-disposition';
import type { OrderDays } from './client-order-history.service';

/** Ce que le récapitulatif désigne : la société de l'URL, les commandes cochées, la période affichée. */
export interface OrderSummarySelection {
  readonly companyId: string;
  readonly orderIds: readonly string[];
  readonly period: OrderDays;
}

/** Les deux fichiers du récapitulatif. */
export type OrderSummaryFileFormat = 'pdf' | 'csv';

/** Un fichier reçu, et le nom que le serveur lui donne. */
export interface OrderSummaryFile {
  readonly fileName: string;
  readonly blob: Blob;
}

/** Le nom de repli, quand `Content-Disposition` n'est pas lisible. */
export const SUMMARY_FALLBACK_NAMES: Readonly<Record<OrderSummaryFileFormat, string>> = {
  pdf: 'recapitulatif.pdf',
  csv: 'recapitulatif.csv',
};

/**
 * Le serveur a refusé. `message` est le sien — un id hors du mur, le plafond —
 * ou `null` quand la réponse n'en portait pas (réseau, panne).
 */
export class OrderSummaryRefused extends Error {
  constructor(readonly serverMessage: string | null) {
    super(serverMessage ?? 'récapitulatif refusé');
  }
}

/**
 * **Le récapitulatif de commandes cochées** — `POST
 * /companies/:companyId/orders/summary` (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R3).
 *
 * Calculé au serveur, jamais ici : l'écran envoie des ids et lit ce qu'on lui
 * rend. La période n'est qu'imprimée (§9) — les ids font foi. Le mur (un id
 * hors de la société ou de ses sites) et le plafond sont tenus par l'API ; un
 * refus remonte avec SON message.
 */
@Injectable({ providedIn: 'root' })
export class OrderSummaryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /** Le récapitulatif à l'écran (`format: json`). */
  async summarize(selection: OrderSummarySelection): Promise<CompanyOrderSummaryView> {
    try {
      return await firstValueFrom(
        this.http.post<CompanyOrderSummaryView>(
          this.url(selection.companyId),
          bodyOf(selection, 'json'),
          { headers: await this.headers() },
        ),
      );
    } catch (error) {
      throw new OrderSummaryRefused(await serverMessageOf(error));
    }
  }

  /** Le même récapitulatif en PDF ou au tableur, en blob : la route est authentifiée. */
  async file(
    selection: OrderSummarySelection,
    format: OrderSummaryFileFormat,
  ): Promise<OrderSummaryFile> {
    try {
      const response = await firstValueFrom(
        this.http.post(this.url(selection.companyId), bodyOf(selection, format), {
          headers: await this.headers(),
          responseType: 'blob',
          observe: 'response',
        }),
      );
      return {
        fileName:
          attachmentFileName(response.headers.get('Content-Disposition')) ??
          SUMMARY_FALLBACK_NAMES[format],
        blob: response.body ?? new Blob([]),
      };
    } catch (error) {
      throw new OrderSummaryRefused(await serverMessageOf(error));
    }
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${encodeURIComponent(companyId)}/orders/summary`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

/** Le corps : la période seulement si une borne est posée. */
function bodyOf(
  selection: OrderSummarySelection,
  format: CompanyOrderSummaryRequest['format'],
): CompanyOrderSummaryRequest {
  const period = {
    ...(selection.period.from === null ? {} : { from: selection.period.from }),
    ...(selection.period.to === null ? {} : { to: selection.period.to }),
  };
  const bounded = selection.period.from !== null || selection.period.to !== null;
  return { orderIds: [...selection.orderIds], format, ...(bounded ? { period } : {}) };
}

/**
 * Le `message` de l'enveloppe d'`AppErrorFilter` — en objet pour le JSON, en
 * `Blob` à relire pour un fichier demandé.
 */
async function serverMessageOf(error: unknown): Promise<string | null> {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  try {
    const body: unknown =
      error.error instanceof Blob ? JSON.parse(await error.error.text()) : error.error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body;
      return typeof message === 'string' && message !== '' ? message : null;
    }
    return null;
  } catch {
    return null;
  }
}
