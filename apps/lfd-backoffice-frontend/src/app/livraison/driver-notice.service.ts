import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { MyDriverNoticeView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const MY_NOTICE = `${B2B_API_BASE}/admin/livraison/mes-donnees`;

/**
 * **« Mes données »** — le texte d'information du livreur et son accusé
 * (`documentation/legal/rgpd-livreur.md`, §7 point 2), sous `delivery_driving`.
 * La personne n'est jamais un paramètre : on ne lit et n'accuse que pour soi.
 */
@Injectable({ providedIn: 'root' })
export class DriverNoticeService {
  private readonly http = inject(HttpClient);

  mine(): Promise<MyDriverNoticeView> {
    return firstValueFrom(this.http.get<MyDriverNoticeView>(MY_NOTICE));
  }

  /** « J'ai compris » — la version LUE ; rejouée, la route répond pareil. */
  async acknowledge(version: number): Promise<void> {
    await firstValueFrom(this.http.post(`${MY_NOTICE}/accuse`, { version }));
  }
}
