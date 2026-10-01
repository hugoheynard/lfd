import { Injectable } from '@angular/core';
import type {
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';

import { DeliveryLoadingService } from './delivery-loading.service';

/**
 * **Les routes du chargement d'UNE tournée** — ce dont l'écran de
 * chargement et son plan ont besoin, sans dire par quelle porte.
 *
 * Deux portes servent les MÊMES vues et les MÊMES corps
 * (`delivery-my-round.ts`, PL1) : celle du dépôt (`admin/livraison/chargement`,
 * sous `delivery_loading`), et celle du livreur
 * (`admin/livraison/ma-tournee/:roundId/chargement`, sous `delivery_driving`,
 * murée à SES tournées). Les composants du chargement dépendent de cette
 * abstraction ; la page qui les héberge choisit la porte.
 *
 * Par défaut, la porte du dépôt : l'écran de chargement existant n'a rien à
 * déclarer.
 */
@Injectable({ providedIn: 'root', useExisting: DeliveryLoadingService })
export abstract class LoadingGateway {
  abstract round(roundId: string): Promise<DeliveryLoadingRoundView>;
  /** Le plan de chargement : un ordre SUGGÉRÉ et un volume. Une lecture. */
  abstract plan(roundId: string): Promise<DeliveryLoadingPlanView>;
  abstract load(roundId: string, payload: LoadDeliveryBinPayload): Promise<void>;
  abstract unload(roundId: string, binId: string): Promise<void>;
}
