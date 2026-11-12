import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  DeparturePayload,
  DepartureView,
  VehiclePayload,
  VehiclesView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const VEHICLES = `${B2B_API_BASE}/admin/delivery/vehicles`;
const DEPARTURE = `${B2B_API_BASE}/admin/delivery/departure`;

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

  /** `intentKey` : la clé du geste (`GestureIntents`) — un double clic ne crée qu'un véhicule. */
  async addVehicle(payload: VehiclePayload, intentKey: string): Promise<void> {
    await this.addVehicleAndGetId(payload, intentKey);
  }

  /**
   * La même création, qui rend l'identifiant du véhicule créé : l'outil agent
   * (`agent/vehicle-agent-tools.ts`) relit la fiche pour dire ses manques.
   */
  async addVehicleAndGetId(payload: VehiclePayload, intentKey: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(VEHICLES, payload, intentOptions(intentKey)),
    );
    return created.id;
  }

  async updateVehicle(id: string, payload: VehiclePayload): Promise<void> {
    await firstValueFrom(this.http.put(`${VEHICLES}/${encodeURIComponent(id)}`, payload));
  }

  async retireVehicle(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${VEHICLES}/${encodeURIComponent(id)}/retirement`, {}));
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
