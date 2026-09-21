import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { StaffNotificationsSummary } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * La **cloche du back-office** — transport pur, aucun état.
 *
 * Le fil est **commun à l'équipe** : marquer lu n'est pas un geste personnel,
 * c'est dire que le fait est traité. Le serveur retient qui s'en est chargé
 * (`readBy`) ; le front n'a rien à filtrer par utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class StaffNotificationsService {
  private readonly http = inject(HttpClient);

  /** Le compteur et les dernières notifications, en un seul appel. */
  summary(): Promise<StaffNotificationsSummary> {
    return firstValueFrom(this.http.get<StaffNotificationsSummary>(this.base));
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/read`, null));
  }

  async markRead(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${id}/read`, null));
  }

  private get base(): string {
    return `${B2B_API_BASE}/admin/notifications`;
  }
}
