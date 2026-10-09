import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { MandateBankExportCreatedView, MandateBankExportsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les mandats à la banque** — l'export du fichier d'import des mandats du
 * portail de la banque, depuis la fiche d'une entité (plan
 * `documentation/comptabilite/mandat/export-des-mandats-pour-la-banque.md`).
 *
 * Un service à part de `LegalEntitiesService` : ce sont des écritures et un
 * fichier qui porte des IBAN en clair, sous l'ÉCRITURE comptable — pas un
 * réglage de l'entité.
 */
@Injectable({ providedIn: 'root' })
export class MandateBankExportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/legal-entities`;

  /** À exporter, déjà importés, écartés nommés, exports passés. Sans IBAN. */
  async of(entityId: string): Promise<MandateBankExportsView> {
    return firstValueFrom(
      this.http.get<MandateBankExportsView>(`${this.base}/${entityId}/mandate-exports`),
    );
  }

  /** Fige un export, et rend son id. `all` : y compris ce que la banque a déjà. */
  async prepare(entityId: string, all: boolean): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<MandateBankExportCreatedView>(`${this.base}/${entityId}/mandate-exports`, {
        all,
      }),
    );
    return created.exportId;
  }

  /** Le fichier, recalculé par le serveur — 409 si un compte a changé depuis. */
  async file(entityId: string, exportId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/${entityId}/mandate-exports/${exportId}/file.csv`, {
        responseType: 'blob',
      }),
    );
  }

  /** La banque l'a importé : ses mandats ne ressortiront que si leur compte change. */
  async markImported(entityId: string, exportId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/mandate-exports/${exportId}/imported`, {}),
    );
  }
}
