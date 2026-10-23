import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MandateBankExportCreatedView,
  MandateBankExportsView,
  RejectMandateAtBankPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { attachmentFileName } from '../shared/download/content-disposition';
import type { NamedBlob } from './comptabilite-dashboard.service';

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
  async file(entityId: string, exportId: string): Promise<NamedBlob> {
    const response = await firstValueFrom(
      this.http.get(`${this.base}/${entityId}/mandate-exports/${exportId}/file.csv`, {
        responseType: 'blob',
        observe: 'response',
      }),
    );
    if (response.body === null) {
      throw new Error('Le fichier est arrivé sans contenu.');
    }
    // Le nom vient du serveur, figé par export (`CENET-EXC-12-…`, 2026-10-23).
    return {
      blob: response.body,
      fileName: attachmentFileName(response.headers.get('Content-Disposition')),
    };
  }

  /** La banque l'a importé : ses mandats ne ressortiront que si leur compte change. */
  async markImported(entityId: string, exportId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/mandate-exports/${exportId}/imported`, {}),
    );
  }

  /** La banque l'a rejeté : il cesse d'être en attente, ses mandats restent à exporter. */
  async abandon(entityId: string, exportId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/mandate-exports/${exportId}/abandoned`, {}),
    );
  }

  /** Le compte rendu CENET d'un export déposé : la banque avait déjà ce mandat. */
  async reportKnown(entityId: string, exportId: string, mandateId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.lineOf(entityId, exportId, mandateId)}/reported-known`, {}),
    );
  }

  /** Le compte rendu CENET d'un export déposé : ce mandat est en erreur, il repart. */
  async reject(
    entityId: string,
    exportId: string,
    mandateId: string,
    reason: string,
  ): Promise<void> {
    const payload: RejectMandateAtBankPayload = { reason };
    await firstValueFrom(
      this.http.post<void>(`${this.lineOf(entityId, exportId, mandateId)}/rejected`, payload),
    );
  }

  private lineOf(entityId: string, exportId: string, mandateId: string): string {
    return `${this.base}/${entityId}/mandate-exports/${exportId}/mandates/${mandateId}`;
  }
}
