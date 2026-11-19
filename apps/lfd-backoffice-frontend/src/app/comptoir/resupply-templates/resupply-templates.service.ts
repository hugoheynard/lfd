import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AdjustResupplyTemplatePayload,
  CreateResupplyTemplatePayload,
  ResupplyTemplateView,
  SavedResupplyTemplateResponse,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La bibliothèque des modèles de réassort d'un point** —
 * `/admin/resupply-templates`, sous le droit `resupply_templates` (plan
 * `documentation/reassort-boutiques/commander.md § 6`, § 5).
 *
 * Aucune route n'attend d'en-tête d'intention : la création porte sa clé dans
 * le corps (`key`), l'ajustement est tenu par la version lue, l'archivage par
 * sa transition.
 */
@Injectable({ providedIn: 'root' })
export class ResupplyTemplatesService {
  private readonly http = inject(HttpClient);

  /** Les modèles actifs du point, lignes inapplicables marquées. */
  list(siteId: string): Promise<readonly ResupplyTemplateView[]> {
    return firstValueFrom(
      this.http.get<readonly ResupplyTemplateView[]>(
        `${this.base()}/sites/${encodeURIComponent(siteId)}`,
      ),
    );
  }

  create(
    siteId: string,
    payload: CreateResupplyTemplatePayload,
  ): Promise<SavedResupplyTemplateResponse> {
    return firstValueFrom(
      this.http.post<SavedResupplyTemplateResponse>(
        `${this.base()}/sites/${encodeURIComponent(siteId)}`,
        payload,
      ),
    );
  }

  /** Le contenu entier, sous la version lue : une version périmée rend 409. */
  adjust(
    templateId: string,
    payload: AdjustResupplyTemplatePayload,
  ): Promise<SavedResupplyTemplateResponse> {
    return firstValueFrom(
      this.http.put<SavedResupplyTemplateResponse>(
        `${this.base()}/${encodeURIComponent(templateId)}`,
        payload,
      ),
    );
  }

  async archive(templateId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base()}/${encodeURIComponent(templateId)}/archive`, null),
    );
  }

  private base(): string {
    return `${B2B_API_BASE}/admin/resupply-templates`;
  }
}
