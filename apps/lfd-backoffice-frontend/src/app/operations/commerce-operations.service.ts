import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CommerceOperationAudience,
  CommerceOperationKeyResponse,
  CommerceOperationView,
  EditCommerceOperationPayload,
  OperationsMigrationReport,
  PrepareCommerceOperationPayload,
  RescheduleCommerceOperationPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les opérations datées, tenues au commerce** — `/admin/operations`
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * lot 3), sous `lfc_operations`.
 *
 * Interrupteur `OPERATIONS_AT_COMMERCE` fermé, les lectures répondent 409
 * `operations.not_at_commerce` : c'est un état du déploiement, pas une panne,
 * et l'écran le dit comme tel. L'aperçu de la reprise, lui, se lit fermé.
 *
 * Les écritures (lot 3 bis, sous `lfc_operations:write`) : une section de
 * l'écran = un `PUT`, chacune rend la clé et l'écran relit. Fermées, elles
 * répondent 409 `operations.writing_closed`.
 */
@Injectable({ providedIn: 'root' })
export class CommerceOperationsService {
  private readonly http = inject(HttpClient);

  /** Toutes, archivées comprises. */
  list(): Promise<readonly CommerceOperationView[]> {
    return firstValueFrom(this.http.get<readonly CommerceOperationView[]>(this.url()));
  }

  get(key: string): Promise<CommerceOperationView> {
    return firstValueFrom(this.http.get<CommerceOperationView>(this.url(encodeURIComponent(key))));
  }

  /** L'aperçu : ce que la reprise écrirait. Sous `lfc_operations:write`. */
  previewMigration(): Promise<OperationsMigrationReport> {
    return firstValueFrom(this.http.get<OperationsMigrationReport>(this.url('migration')));
  }

  /** Applique la reprise, et rend le relevé d'APRÈS. Rejouable. */
  applyMigration(): Promise<OperationsMigrationReport> {
    return firstValueFrom(this.http.post<OperationsMigrationReport>(this.url('migration'), {}));
  }

  /** Préparer : rend la clé, l'identité qui ne changera plus. */
  prepare(payload: PrepareCommerceOperationPayload): Promise<CommerceOperationKeyResponse> {
    return firstValueFrom(this.http.post<CommerceOperationKeyResponse>(this.url(), payload));
  }

  /** Le nom, le chapeau, l'image — ce que l'encart affiche. */
  editPresentation(
    key: string,
    payload: EditCommerceOperationPayload,
  ): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'presentation', payload);
  }

  /** Les cinq dates, ensemble. */
  reschedule(
    key: string,
    payload: RescheduleCommerceOperationPayload,
  ): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'schedule', payload);
  }

  setAudience(
    key: string,
    audience: CommerceOperationAudience,
  ): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'audience', { audience });
  }

  /** Masquer (`true`) ou afficher — réversible, distinct de l'archivage. */
  setVisibility(key: string, hidden: boolean): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'visibility', { hidden });
  }

  /** La sélection ENTIÈRE, dans l'ordre du rayon. */
  setSelection(key: string, skus: readonly string[]): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'selection', { skus });
  }

  archive(key: string): Promise<CommerceOperationKeyResponse> {
    return this.put(key, 'archive', {});
  }

  private put(key: string, section: string, body: object): Promise<CommerceOperationKeyResponse> {
    return firstValueFrom(
      this.http.put<CommerceOperationKeyResponse>(
        this.url(`${encodeURIComponent(key)}/${section}`),
        body,
      ),
    );
  }

  private url(tail?: string): string {
    const root = `${B2B_API_BASE}/admin/operations`;
    return tail === undefined ? root : `${root}/${tail}`;
  }
}
