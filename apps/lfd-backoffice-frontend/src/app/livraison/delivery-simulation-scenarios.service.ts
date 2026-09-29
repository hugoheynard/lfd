import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  DeliverySimulationFromDayView,
  DeliverySimulationScenarioSummaryView,
  DeliverySimulationScenarioView,
  SaveDeliverySimulationScenarioPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SCENARIOS = `${B2B_API_BASE}/admin/livraison/simulateur/scenarios`;
const FROM_DAY = `${B2B_API_BASE}/admin/livraison/simulateur/depuis-journee`;

/**
 * **Les scénarios du simulateur** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C7 et L9-C8) : lire sous `delivery_rounds:read`, enregistrer, dupliquer
 * et archiver sous `delivery_rounds:write`. Partir d'une journée est une
 * lecture : rien n'est écrit dans la vraie composition.
 */
@Injectable({ providedIn: 'root' })
export class DeliverySimulationScenariosService {
  private readonly http = inject(HttpClient);

  list(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
    return firstValueFrom(this.http.get<DeliverySimulationScenarioSummaryView[]>(SCENARIOS));
  }

  open(id: string): Promise<DeliverySimulationScenarioView> {
    return firstValueFrom(
      this.http.get<DeliverySimulationScenarioView>(`${SCENARIOS}/${encodeURIComponent(id)}`),
    );
  }

  async create(payload: SaveDeliverySimulationScenarioPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(SCENARIOS, payload));
    return created.id;
  }

  async replace(id: string, payload: SaveDeliverySimulationScenarioPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SCENARIOS}/${encodeURIComponent(id)}`, payload));
  }

  async duplicate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SCENARIOS}/${encodeURIComponent(id)}/dupliquer`, null));
  }

  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SCENARIOS}/${encodeURIComponent(id)}/archiver`, null));
  }

  fromDay(day: string): Promise<DeliverySimulationFromDayView> {
    return firstValueFrom(
      this.http.get<DeliverySimulationFromDayView>(FROM_DAY, {
        params: new HttpParams().set('jour', day),
      }),
    );
  }
}
