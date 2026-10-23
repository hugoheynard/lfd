import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AccountBankExportCreatedView,
  AccountBankExportsView,
  DeclareBankAccountKnownPayload,
  KnownBankAccountReasonView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

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
  async file(entityId: string, exportId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/${entityId}/account-exports/${exportId}/file.csv`, {
        responseType: 'blob',
      }),
    );
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

  /** Le compte est déjà chez la banque, sans notre fichier — saisi dans CENET, ou signalé par elle. */
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
}
