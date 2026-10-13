import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedPickupResponse,
  PickupAddressPayload,
  PickupAddressUpdatePayload,
  PublicPickupSchedulePayload,
  PublicPickupScheduleView,
  SiteColorsPayload,
  SiteRolesPayload,
  SiteView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const SITES = `${B2B_API_BASE}/admin/sites`;

/**
 * **Réglages › Sites** — l'API de l'écran, sous `lfc_site_settings` (plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
 * §3.4, lot S1).
 *
 * Seul l'écran des sites passe par ici. Le comptoir, la saisie de commande et
 * les heures limites lisent la route PUBLIQUE de `PickupAddressesService.list()`
 * (vérifié le 2026-10-13) : mettre cette surface sous un droit neuf ne leur
 * coupe rien.
 *
 * Rôles et couleurs s'enregistrent chacun EN BLOC (`PUT`) : leur cohérence se
 * juge sur l'ensemble, côté serveur, qui reste l'autorité.
 */
@Injectable({ providedIn: 'root' })
export class SitesService {
  private readonly http = inject(HttpClient);

  /** Tous les sites — le défaut en tête, les archivés à la fin. */
  list(): Promise<readonly SiteView[]> {
    return firstValueFrom(this.http.get<readonly SiteView[]>(SITES));
  }

  get(id: string): Promise<SiteView> {
    return firstValueFrom(this.http.get<SiteView>(`${SITES}/${encodeURIComponent(id)}`));
  }

  create(payload: PickupAddressPayload): Promise<CreatedPickupResponse> {
    return firstValueFrom(this.http.post<CreatedPickupResponse>(SITES, payload));
  }

  /** Le lieu : adresse, heures pros, réduction, GPS, rang par défaut. */
  async update(id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    await firstValueFrom(this.http.patch<void>(`${SITES}/${encodeURIComponent(id)}`, payload));
  }

  async setRoles(id: string, payload: SiteRolesPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${SITES}/${encodeURIComponent(id)}/roles`, payload));
  }

  async setColors(id: string, payload: SiteColorsPayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${SITES}/${encodeURIComponent(id)}/couleurs`, payload),
    );
  }

  /** Archiver : il n'y a pas de suppression. Le serveur refuse le défaut et celui qui expédie. */
  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${SITES}/${encodeURIComponent(id)}/archive`, null));
  }

  /** L'horaire PUBLIC du site : plages de créneaux et fermetures. */
  publicSchedule(id: string): Promise<PublicPickupScheduleView> {
    return firstValueFrom(
      this.http.get<PublicPickupScheduleView>(
        `${SITES}/${encodeURIComponent(id)}/creneaux-publics`,
      ),
    );
  }

  /** En bloc : le refus de chevauchement se juge sur l'ensemble des plages. */
  async savePublicSchedule(id: string, payload: PublicPickupSchedulePayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${SITES}/${encodeURIComponent(id)}/creneaux-publics`, payload),
    );
  }
}
