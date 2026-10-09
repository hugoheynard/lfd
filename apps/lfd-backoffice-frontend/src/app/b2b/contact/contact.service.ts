import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ContactMessageStatus,
  ContactMessageView,
  ContactPhonePayload,
  ContactPhoneView,
  ContactSettingsPayload,
  ContactSettingsView,
  ContactSubjectPayload,
  ContactSubjectView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **« Nous écrire »** côté back-office — les objets proposés au formulaire, la
 * carte de contact de la boutique et les messages reçus
 * (`documentation/contenu-ecommerce/nous-contacter.md`, §2.1, §2.3, §4).
 *
 * Les écritures rendent `204` (ou l'identifiant créé) : l'appelant relit.
 */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/contact`;

  subjects(): Promise<ContactSubjectView[]> {
    return firstValueFrom(this.http.get<ContactSubjectView[]>(`${this.base}/subjects`));
  }

  createSubject(payload: ContactSubjectPayload): Promise<void> {
    return firstValueFrom(this.http.post<unknown>(`${this.base}/subjects`, payload)).then(
      () => undefined,
    );
  }

  updateSubject(id: string, payload: ContactSubjectPayload): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/subjects/${encodeURIComponent(id)}`, payload),
    );
  }

  archiveSubject(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/subjects/${encodeURIComponent(id)}/archive`, null),
    );
  }

  phones(): Promise<ContactPhoneView[]> {
    return firstValueFrom(this.http.get<ContactPhoneView[]>(`${this.base}/phones`));
  }

  createPhone(payload: ContactPhonePayload): Promise<void> {
    return firstValueFrom(this.http.post<unknown>(`${this.base}/phones`, payload)).then(
      () => undefined,
    );
  }

  updatePhone(id: string, payload: ContactPhonePayload): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/phones/${encodeURIComponent(id)}`, payload),
    );
  }

  archivePhone(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/phones/${encodeURIComponent(id)}/archive`, null),
    );
  }

  settings(): Promise<ContactSettingsView> {
    return firstValueFrom(this.http.get<ContactSettingsView>(`${this.base}/settings`));
  }

  updateSettings(payload: ContactSettingsPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.base}/settings`, payload));
  }

  messages(status: ContactMessageStatus): Promise<ContactMessageView[]> {
    return firstValueFrom(
      this.http.get<ContactMessageView[]>(`${this.base}/messages`, { params: { status } }),
    );
  }

  /** Un second traitement est refusé (409 `contact.message.already_handled`). */
  markHandled(id: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/messages/${encodeURIComponent(id)}/handled`, null),
    );
  }
}
