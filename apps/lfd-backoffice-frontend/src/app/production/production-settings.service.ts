import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DossierRecipientPayload,
  DossierRecipientView,
  DossierStaffCandidateView,
  ProductionSettingsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SETTINGS = `${B2B_API_BASE}/admin/production/settings`;
const RECIPIENTS = `${SETTINGS}/dossier-recipients`;

/**
 * **Les réglages du fournil** — l'arrêt du plan en lecture et les jours fermés
 * (plan `documentation/production/arret-du-plan.md`), sous
 * `production_settings`. L'arrêt ne se règle plus ici depuis le 2026-10-21 :
 * il suit l'heure limite générale.
 *
 * Aucun état : l'écran relit après chaque écriture. Les refus remontent tels
 * quels.
 */
@Injectable({ providedIn: 'root' })
export class ProductionSettingsService {
  private readonly http = inject(HttpClient);

  settings(): Promise<ProductionSettingsView> {
    return firstValueFrom(this.http.get<ProductionSettingsView>(SETTINGS));
  }

  async addClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SETTINGS}/closed-days`, { date }));
  }

  async removeClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${SETTINGS}/closed-days/${encodeURIComponent(date)}`));
  }

  /** Les destinataires du dossier du jour (plan `dossier-prod-du-jour.md`, lot E2). */
  dossierRecipients(): Promise<DossierRecipientView[]> {
    return firstValueFrom(this.http.get<DossierRecipientView[]>(RECIPIENTS));
  }

  dossierStaffCandidates(): Promise<DossierStaffCandidateView[]> {
    return firstValueFrom(
      this.http.get<DossierStaffCandidateView[]>(`${RECIPIENTS}/staff-candidates`),
    );
  }

  async addDossierRecipient(payload: DossierRecipientPayload): Promise<void> {
    await firstValueFrom(this.http.post(RECIPIENTS, payload));
  }

  async removeDossierRecipient(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${RECIPIENTS}/${encodeURIComponent(id)}`));
  }
}
