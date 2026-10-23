import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AccountBankExportCreatedView,
  AccountBankExportsView,
  DeclareBankAccountKnownPayload,
  KnownBankAccountReasonView,
  RejectBankAccountPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { attachmentFileName } from '../shared/download/content-disposition';
import type { NamedBlob } from './comptabilite-dashboard.service';

/**
 * **Les comptes à la banque** — l'export du fichier des comptes destinataires
 * du portail de la banque, depuis la fiche d'une entité (doc
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md`).
 *
 * Un service à part de celui des mandats : deux fichiers, deux modèles de la
 * banque, et des gestes qui ne sont pas les mêmes (abandonner, « déjà connu »).
 */
@Injectable({ providedIn: 'root' })
export class AccountBankExportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/legal-entities`;

  /** À exporter (nommés), en vol, connus, écartés, exports passés. Sans IBAN. */
  async of(entityId: string): Promise<AccountBankExportsView> {
    return firstValueFrom(
      this.http.get<AccountBankExportsView>(`${this.base}/${entityId}/account-exports`),
    );
  }

  /** Fige un export des comptes à exporter, et rend son id. */
  async prepare(entityId: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<AccountBankExportCreatedView>(`${this.base}/${entityId}/account-exports`, {}),
    );
    return created.exportId;
  }

  /** Le fichier, recalculé par le serveur et journalisé — 409 si un RIB a changé depuis. */
  async file(entityId: string, exportId: string): Promise<NamedBlob> {
    const response = await firstValueFrom(
      this.http.get(`${this.base}/${entityId}/account-exports/${exportId}/file.csv`, {
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

  /** La banque l'a importé : ses comptes ne ressortiront plus. */
  async markImported(entityId: string, exportId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/account-exports/${exportId}/imported`, {}),
    );
  }

  /** La banque l'a rejeté : ses comptes redeviennent à exporter. */
  async abandon(entityId: string, exportId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/account-exports/${exportId}/abandoned`, {}),
    );
  }

  /** Le compte rendu CENET d'un export déposé : la banque avait déjà ce compte. */
  async reportKnown(entityId: string, exportId: string, bankAccountId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.lineOf(entityId, exportId, bankAccountId)}/reported-known`, {}),
    );
  }

  /** Le compte rendu CENET d'un export déposé : ce compte est en erreur, il repart. */
  async reject(
    entityId: string,
    exportId: string,
    bankAccountId: string,
    reason: string,
  ): Promise<void> {
    const payload: RejectBankAccountPayload = { reason };
    await firstValueFrom(
      this.http.post<void>(`${this.lineOf(entityId, exportId, bankAccountId)}/rejected`, payload),
    );
  }

  /** Le compte est déjà chez la banque, sans notre fichier — saisi à la main dans CENET. */
  async declareKnown(
    entityId: string,
    bankAccountId: string,
    reason: KnownBankAccountReasonView,
  ): Promise<void> {
    const payload: DeclareBankAccountKnownPayload = { bankAccountId, reason };
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${entityId}/account-exports/known-accounts`, payload),
    );
  }

  private lineOf(entityId: string, exportId: string, bankAccountId: string): string {
    return `${this.base}/${entityId}/account-exports/${exportId}/accounts/${bankAccountId}`;
  }
}
