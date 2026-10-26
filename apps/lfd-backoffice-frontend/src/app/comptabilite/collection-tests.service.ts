import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CollectionTestCreatedView,
  CollectionTestDebtorsView,
  CollectionTestsView,
  GenerateCollectionTestPayload,
  OwnEstablishmentsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le prélèvement d'essai et nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`), sous
 * le droit `collection_test`.
 *
 * Le fichier porte l'IBAN du débiteur en clair : il se lit sous l'ÉCRITURE,
 * et se télécharge sans être gardé par l'écran.
 */
@Injectable({ providedIn: 'root' })
export class CollectionTestsService {
  private readonly http = inject(HttpClient);
  private readonly establishments = `${B2B_API_BASE}/admin/accounting/own-establishments`;
  private readonly tests = `${B2B_API_BASE}/admin/accounting/collection-tests`;

  async ownEstablishments(): Promise<OwnEstablishmentsView> {
    return firstValueFrom(this.http.get<OwnEstablishmentsView>(this.establishments));
  }

  async declare(companyId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(this.establishments, { companyId }));
  }

  async withdraw(companyId: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.establishments}/${companyId}/withdraw`, {}));
  }

  /** Nos établissements, prélevables à l'essai ou pourquoi pas. */
  async debtors(): Promise<CollectionTestDebtorsView> {
    return firstValueFrom(this.http.get<CollectionTestDebtorsView>(`${this.tests}/debtors`));
  }

  async list(): Promise<CollectionTestsView> {
    return firstValueFrom(this.http.get<CollectionTestsView>(this.tests));
  }

  /** Génère et garde le fichier ; rend l'id de l'essai. */
  async generate(payload: GenerateCollectionTestPayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CollectionTestCreatedView>(this.tests, payload),
    );
    return created.testId;
  }

  async file(testId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.tests}/${testId}/file.xml`, { responseType: 'blob' }),
    );
  }

  /**
   * Le mandat de l'établissement au format d'import de la banque — une seule
   * ligne. Ne fige aucun export de l'entité.
   */
  async mandateFile(companyId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.tests}/debtors/${companyId}/mandate.csv`, { responseType: 'blob' }),
    );
  }

  /**
   * Le RIB de l'établissement au format des comptes destinataires de la
   * banque — une seule ligne. Ne fige aucun export ; le serveur journalise
   * chaque téléchargement.
   */
  async bankAccountFile(companyId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.tests}/debtors/${companyId}/bank-account.csv`, {
        responseType: 'blob',
      }),
    );
  }

  async markRefunded(testId: string, refundedOn: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.tests}/${testId}/refunded`, { refundedOn }));
  }
}
