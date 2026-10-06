import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { StaffNotificationsSummary } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Mes notifications** — celles adressées à un droit que je tiens
 * (`documentation/livraisons/a-la-porte.md`, B5) : « arrêt à décider »
 * pour les commerciaux. Transport pur, aucun état.
 *
 * Ouvert à tout staff connecté : le serveur filtre par mes droits dans chaque
 * requête — le front n'a rien à trier, et ne pourrait rien élargir.
 */
@Injectable({ providedIn: 'root' })
export class MyStaffNotificationsService {
  private readonly http = inject(HttpClient);

  summary(): Promise<StaffNotificationsSummary> {
    return firstValueFrom(this.http.get<StaffNotificationsSummary>(this.base));
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/read`, null));
  }

  async markRead(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/${encodeURIComponent(id)}/read`, null));
  }

  private get base(): string {
    return `${B2B_API_BASE}/admin/me/notifications`;
  }
}
