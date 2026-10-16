import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CommerceOperationView, OperationsMigrationReport } from '@lfd/contracts';
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

  private url(tail?: string): string {
    const root = `${B2B_API_BASE}/admin/operations`;
    return tail === undefined ? root : `${root}/${tail}`;
  }
}
