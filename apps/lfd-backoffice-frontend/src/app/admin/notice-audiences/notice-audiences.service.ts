import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  SetStaffNoticeAudiencePayload,
  StaffNoticeAudiencesView,
  StaffNoticeTemplate,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les destinataires des avis** — à qui part un e-mail que le système écrit à
 * l'équipe, sous `staff_notice_audiences`. Le `PUT` pose l'ensemble complet et
 * se déclare `@Idempotent` côté serveur : il ne porte donc pas de clé
 * d'intention (vérifié le 2026-11-22).
 */
@Injectable({ providedIn: 'root' })
export class NoticeAudiencesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/staff-notice-audiences`;

  board(): Promise<StaffNoticeAudiencesView> {
    return firstValueFrom(this.http.get<StaffNoticeAudiencesView>(this.base));
  }

  setAudience(
    template: StaffNoticeTemplate,
    payload: SetStaffNoticeAudiencePayload,
  ): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/${encodeURIComponent(template)}`, payload),
    );
  }
}
