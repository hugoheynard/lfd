import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DeparturePayload, DepartureView, VehiclePayload, VehiclesView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const VEHICLES = `${B2B_API_BASE}/admin/livraison/vehicules`;
const DEPARTURE = `${B2B_API_BASE}/admin/livraison/depart`;

/**
 * **Les bases paramétrables de la livraison** — la flotte et le point de
 * départ des tournées (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 2), sous `delivery_settings`.
 *
 * Aucun état : chaque écran relit après une écriture. Les refus du serveur
 * remontent tels quels — la plaque en double nomme le véhicule qui la porte, et
 * c'est cette phrase-là que l'écran doit montrer.
 */
@Injectable({ providedIn: 'root' })
export class DeliverySettingsService {
  private readonly http = inject(HttpClient);

  vehicles(): Promise<VehiclesView> {
    return firstValueFrom(this.http.get<VehiclesView>(VEHICLES));
  }

  async addVehicle(payload: VehiclePayload): Promise<void> {
    await firstValueFrom(this.http.post(VEHICLES, payload));
  }

  async updateVehicle(id: string, payload: VehiclePayload): Promise<void> {
    await firstValueFrom(this.http.put(`${VEHICLES}/${encodeURIComponent(id)}`, payload));
  }

  async retireVehicle(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${VEHICLES}/${encodeURIComponent(id)}/retrait`, {}));
  }

  async reactivateVehicle(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${VEHICLES}/${encodeURIComponent(id)}/reactivation`, {}));
  }

  departure(): Promise<DepartureView> {
    return firstValueFrom(this.http.get<DepartureView>(DEPARTURE));
  }

  async setDeparture(payload: DeparturePayload): Promise<void> {
    await firstValueFrom(this.http.put(DEPARTURE, payload));
  }
}
