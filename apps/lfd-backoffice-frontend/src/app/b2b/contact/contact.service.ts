import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ContactPhonePayload,
  ContactPhoneView,
  ContactSettingsPayload,
  ContactSettingsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La carte de contact** côté back-office — ses textes et ses numéros. Les
 * motifs et les demandes ont leur service (`b2b/demandes/`, plan
 * `documentation/contenu-ecommerce/demandes-clients.md`).
 *
 * Les écritures rendent `204` (ou l'identifiant créé) : l'appelant relit.
 */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/contact`;

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
}
