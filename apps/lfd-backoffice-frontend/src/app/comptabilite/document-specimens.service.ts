import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import type { SpecimenKey } from './document-specimen-catalogue';

/**
 * **Les exemplaires de la planche des documents** — `GET
 * admin/document-specimens/<document>.pdf`, servis par le bloc qui possède
 * chaque document (commerce, fournil, livraison), tous sous
 * `b2b_accounting:read` (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Un `HttpClient` et non un lien : l'intercepteur pose le jeton staff, qu'un
 * `<a href>` ou un `<iframe src>` vers l'API n'enverrait pas.
 */
@Injectable({ providedIn: 'root' })
export class DocumentSpecimensService {
  private readonly http = inject(HttpClient);

  async pdf(key: SpecimenKey): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/document-specimens/${key}.pdf`, {
        responseType: 'blob',
      }),
    );
  }
}
