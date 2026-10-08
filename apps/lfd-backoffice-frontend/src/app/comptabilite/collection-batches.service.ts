import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CollectionCycleView,
  CollectionPreviewView,
  ConstitutedBatchesView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { attachmentFileName } from '../shared/download/content-disposition';
import type { NamedBlob } from './comptabilite-dashboard.service';

/**
 * Les **lots de prélèvement figés** — l'écran « Prélèvement du mois » (plan
 * `documentation/comptabilite/prelevement/plan-lot-de-prelevement-fige.md`, P2).
 *
 * Les gestes demandent `b2b_accounting:write` ; le serveur refuse de toute
 * façon, et ses refus nomment le cas (société sans mandat, mandat révoqué…).
 */
@Injectable({ providedIn: 'root' })
export class CollectionBatchesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/collection`;

  async cycle(legalEntityId: string): Promise<CollectionCycleView> {
    return firstValueFrom(
      this.http.get<CollectionCycleView>(`${this.base}/cycle`, { params: { legalEntityId } }),
    );
  }

  /** L'aperçu du mois qui court, calculé comme le lot — rien n'est écrit (PA4). */
  async preview(legalEntityId: string): Promise<CollectionPreviewView> {
    return firstValueFrom(
      this.http.get<CollectionPreviewView>(`${this.base}/preview`, { params: { legalEntityId } }),
    );
  }

  async constitute(legalEntityId: string): Promise<ConstitutedBatchesView> {
    return firstValueFrom(
      this.http.post<ConstitutedBatchesView>(`${this.base}/batches`, { legalEntityId }),
    );
  }

  async cancel(batchId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/batches/${batchId}/cancel`, {}));
  }

  async deposit(batchId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/batches/${batchId}/deposit`, {}));
  }

  async settleOtherwise(orderId: string, note: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/orders/${orderId}/settle-otherwise`, { note }),
    );
  }

  /** Le fichier STOCKÉ du lot — le serveur vérifie son empreinte avant de le rendre. */
  async file(batchId: string): Promise<NamedBlob> {
    return this.named(`${this.base}/batches/${batchId}/file.xml`);
  }

  async audit(batchId: string): Promise<NamedBlob> {
    return this.named(`${this.base}/batches/${batchId}/audit.csv`);
  }

  private async named(url: string): Promise<NamedBlob> {
    const response = await firstValueFrom(
      this.http.get(url, { responseType: 'blob', observe: 'response' }),
    );
    if (response.body === null) {
      throw new Error('Le fichier est arrivé sans contenu.');
    }
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }
}
