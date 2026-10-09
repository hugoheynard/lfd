import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  BatchCollectionReturnsView,
  CollectionReturnImportPreviewView,
  CollectionReturnImportResultView,
  CollectionReturnView,
  CreatedIdResponse,
  RecordCollectionReturnPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **retours bancaires** d'un prélèvement (plan
 * `documentation/comptabilite/prelevement/plan-retours-bancaires.md`, R5a et
 * R5b). Lire demande `b2b_accounting:read`, tout le reste `:write` ; le
 * serveur refuse de toute façon, et ses refus nomment le cas et le geste.
 */
@Injectable({ providedIn: 'root' })
export class CollectionReturnsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/collection-returns`;

  async ofBatch(batchId: string): Promise<BatchCollectionReturnsView> {
    return firstValueFrom(
      this.http.get<BatchCollectionReturnsView>(`${this.base}/batches/${batchId}`),
    );
  }

  /** Les retours dont la ligne débitait cette société — la fiche du payeur. */
  async ofPayer(companyId: string): Promise<readonly CollectionReturnView[]> {
    return firstValueFrom(
      this.http.get<readonly CollectionReturnView[]>(`${this.base}/payers/${companyId}`),
    );
  }

  async record(
    batchId: string,
    rank: number,
    payload: RecordCollectionReturnPayload,
  ): Promise<CreatedIdResponse> {
    return firstValueFrom(
      this.http.post<CreatedIdResponse>(`${this.base}/batches/${batchId}/lines/${rank}`, payload),
    );
  }

  async represent(returnId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${returnId}/represent`, {}));
  }

  async settleOtherwise(returnId: string, note: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${returnId}/settle-otherwise`, { note }),
    );
  }

  async writeOff(returnId: string, note: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${returnId}/write-off`, { note }));
  }

  /** L'aperçu d'un fichier de la banque — rien n'est écrit. */
  async previewImport(file: File): Promise<CollectionReturnImportPreviewView> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.http.post<CollectionReturnImportPreviewView>(`${this.base}/import/preview`, form),
    );
  }

  /** Enregistre les transactions retenues ; le serveur relit le fichier. */
  async confirmImport(
    file: File,
    endToEndIds: readonly string[],
  ): Promise<CollectionReturnImportResultView> {
    const form = new FormData();
    form.append('file', file);
    form.append('endToEndIds', JSON.stringify(endToEndIds));
    return firstValueFrom(
      this.http.post<CollectionReturnImportResultView>(`${this.base}/import/confirm`, form),
    );
  }
}
