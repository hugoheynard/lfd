import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AppointmentTransitionPayload,
  AppointmentView,
  AvailabilityConfigPayload,
  AvailabilityConfigView,
  AvailabilityExceptionPayload,
  BookingPolicy,
  CreatedAppointmentResponse,
  SlotsView,
  StaffBookAppointmentPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Transport de la **prise de rendez-vous** côté staff : la disponibilité
 * déclarée, son aperçu, et la file des rendez-vous.
 *
 * L'aperçu (`slots`) frappe `/admin/availability/slots`, qui exécute la **même**
 * query que la route client — c'est ce qui garantit que le commercial voit
 * exactement ce qu'il vient d'ouvrir, et pas une seconde implémentation qui
 * dériverait.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);
  private readonly base = `${B2B_API_BASE}/admin`;

  config(): Promise<AvailabilityConfigView> {
    return this.request<AvailabilityConfigView>('GET', `${this.base}/availability`);
  }

  save(payload: AvailabilityConfigPayload): Promise<AvailabilityConfigView> {
    return this.request<AvailabilityConfigView>('PUT', `${this.base}/availability`, payload);
  }

  /**
   * Écrit **la seule politique**. Route distincte du bloc : régler une durée ne
   * doit pas renvoyer une grille chargée il y a dix minutes, et donc ne peut pas
   * l'écraser.
   */
  savePolicy(policy: BookingPolicy): Promise<AvailabilityConfigView> {
    return this.request<AvailabilityConfigView>('PUT', `${this.base}/availability/policy`, policy);
  }

  /**
   * Écrit **les seules exceptions**. Même raison que la politique : dater un
   * congé ne renvoie pas la grille, et ne peut donc pas l'écraser.
   */
  saveExceptions(
    exceptions: readonly AvailabilityExceptionPayload[],
  ): Promise<AvailabilityConfigView> {
    return this.request<AvailabilityConfigView>('PUT', `${this.base}/availability/exceptions`, {
      exceptions,
    });
  }

  /** L'aperçu des créneaux ouverts entre deux jours locaux (`AAAA-MM-JJ`). */
  slots(from: string, to: string): Promise<SlotsView> {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.request<SlotsView>('GET', `${this.base}/availability/slots?${query}`);
  }

  /** La file des rendez-vous d'une fenêtre (bornes ISO). */
  appointments(from: string, to: string): Promise<readonly AppointmentView[]> {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.request<readonly AppointmentView[]>('GET', `${this.base}/appointments?${query}`);
  }

  /** **Un** rendez-vous, pour sa page dédiée — un lien direct doit fonctionner. */
  byId(appointmentId: string): Promise<AppointmentView> {
    return this.request<AppointmentView>('GET', `${this.base}/appointments/${appointmentId}`);
  }

  schedule(payload: StaffBookAppointmentPayload): Promise<CreatedAppointmentResponse> {
    return this.request<CreatedAppointmentResponse>('POST', `${this.base}/appointments`, payload);
  }

  transition(id: string, payload: AppointmentTransitionPayload): Promise<void> {
    return this.request<void>('PATCH', `${this.base}/appointments/${id}`, payload);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    const headers = token === null ? {} : { Authorization: `Bearer ${token}` };
    return firstValueFrom(this.http.request<T>(method, url, { body, headers }));
  }
}
