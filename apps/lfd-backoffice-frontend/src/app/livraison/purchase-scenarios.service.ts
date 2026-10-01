import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  PurchaseScenariosView,
  PurchaseScenarioView,
  SavePurchaseScenarioPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SCENARIOS = `${B2B_API_BASE}/admin/livraison/assistant-achat/scenarios`;

/**
 * **Les scénarios d'achat** (`documentation/livraisons/plan-bibliotheque-d-achat.md`,
 * B-D5) : lire sous `delivery_rounds:read`, enregistrer, remplacer, archiver
 * et réactiver sous `delivery_rounds:write` (B-D6). Relancer le tableau n'est
 * pas ici : l'écran envoie la sélection relue à `PurchaseLibraryService.table`.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseScenariosService {
  private readonly http = inject(HttpClient);

  list(includeArchived: boolean): Promise<PurchaseScenariosView> {
    return firstValueFrom(
      this.http.get<PurchaseScenariosView>(SCENARIOS, {
        params: includeArchived ? { archives: 'inclure' } : {},
      }),
    );
  }

  /** Un élément archivé ou disparu ne l'empêche pas de s'ouvrir : il est dans `issues`. */
  open(id: string): Promise<PurchaseScenarioView> {
    return firstValueFrom(
      this.http.get<PurchaseScenarioView>(`${SCENARIOS}/${encodeURIComponent(id)}`),
    );
  }

  async create(payload: SavePurchaseScenarioPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(SCENARIOS, payload));
    return created.id;
  }

  async replace(id: string, payload: SavePurchaseScenarioPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${SCENARIOS}/${encodeURIComponent(id)}`, payload));
  }

  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SCENARIOS}/${encodeURIComponent(id)}/archiver`, {}));
  }

  async reactivate(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${SCENARIOS}/${encodeURIComponent(id)}/reactiver`, {}));
  }
}
