import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AssignCreditorIdentifierPayload,
  CorrectLegalEntityPayload,
  CreatedIdResponse,
  DeclareLegalEntityPayload,
  LegalEntityView,
  SetCreditorAccountPayload,
  SetPreNotificationPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Accès à la surface **staff** des entités juridiques émettrices.
 *
 * Transport pur : aucune règle ici. Ce qu'un écran doit savoir de la complétude
 * d'une entité arrive **déjà répondu** dans la vue (`canCollect`,
 * `missingToCollect`) — recalculer côté front ferait une seconde définition de
 * « complète », et c'est celle que l'utilisateur lit qui dériverait.
 *
 * 🔴 L'IBAN part par `setCreditorAccount` et ne revient jamais : la vue n'en
 * porte que les quatre derniers caractères. Aucune méthode de lecture ne peut
 * le rendre — il n'y en a pas côté serveur.
 */
@Injectable({ providedIn: 'root' })
export class LegalEntitiesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/legal-entities`;

  async list(): Promise<readonly LegalEntityView[]> {
    return firstValueFrom(this.http.get<readonly LegalEntityView[]>(this.base));
  }

  async declare(payload: DeclareLegalEntityPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(this.base, payload));
    return created.id;
  }

  async correct(id: string, payload: CorrectLegalEntityPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}`, payload));
  }

  /** Sans retour : l'agrégat refuse un second ICS, et le serveur répond 409. */
  async assignCreditorIdentifier(
    id: string,
    payload: AssignCreditorIdentifierPayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/creditor-identifier`, payload));
  }

  async setCreditorAccount(id: string, payload: SetCreditorAccountPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/creditor-account`, payload));
  }

  async setPreNotification(id: string, payload: SetPreNotificationPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/pre-notification`, payload));
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/archived`, { archived }));
  }
}
