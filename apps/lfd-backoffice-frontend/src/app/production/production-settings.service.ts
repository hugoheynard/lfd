import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DossierRecipientPayload,
  DossierRecipientView,
  DossierStaffCandidateView,
  ProductionDisplayPayload,
  ProductionSettingsView,
  ProductionTrackingPayload,
  ProductionTrackingView,
  ProductionTranchesPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const SETTINGS = `${B2B_API_BASE}/admin/production/settings`;
const RECIPIENTS = `${SETTINGS}/dossier-recipients`;

/**
 * **Les réglages du fournil** — l'arrêt du plan en lecture et les jours fermés
 * (plan `documentation/fournil/arret-du-plan.md`), sous
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

  /** Le niveau de suivi du fournil, sa marge et sa mise en service (plan des niveaux de suivi). */
  tracking(): Promise<ProductionTrackingView> {
    return firstValueFrom(this.http.get<ProductionTrackingView>(`${SETTINGS}/tracking`));
  }

  /** Pose le niveau du fournil et sa marge ; par intention. */
  async saveTracking(payload: ProductionTrackingPayload, intentKey: string): Promise<void> {
    await firstValueFrom(this.http.put(`${SETTINGS}/tracking`, payload, intentOptions(intentKey)));
  }

  async addClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SETTINGS}/closed-days`, { date }));
  }

  async removeClosedDay(date: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${SETTINGS}/closed-days/${encodeURIComponent(date)}`));
  }

  /** Les tranches de production (plan `fournil/le-previsionnel.md`, T1). */
  async saveTranches(payload: ProductionTranchesPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SETTINGS}/tranches`, payload));
  }

  /** Le rangement du fournil : afficher ou non les sous-catégories (2026-10-30). */
  async saveDisplay(payload: ProductionDisplayPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SETTINGS}/display`, payload));
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
