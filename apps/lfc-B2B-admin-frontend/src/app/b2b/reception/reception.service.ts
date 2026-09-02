import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PendingDeliveryView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * La **boîte de réception du catalogue** : ce que le référentiel a livré, et que
 * personne n'a encore accepté.
 *
 * Avant elle, livrer et mettre en vente étaient le même geste : un article reçu
 * était achetable par un client dans la même requête, sans qu'aucun humain de la
 * plateforme ne l'ait relu.
 */
@Injectable({ providedIn: 'root' })
export class ReceptionService {
  private readonly http = inject(HttpClient);

  /**
   * `null` quand rien n'attend — l'état **normal** d'une plateforme à jour.
   *
   * Le serveur ne rend pas `404` pour ça, et l'écran ne doit pas le traiter
   * comme une panne : il n'y a rien à réparer quand il n'y a rien à valider.
   */
  pending(): Promise<PendingDeliveryView | null> {
    return firstValueFrom(
      this.http.get<PendingDeliveryView | null>(`${B2B_API_BASE}/admin/catalog/delivery`),
    );
  }

  /**
   * Valide **en une fois**, avec les SKU qu'on écarte.
   *
   * @param deliveryId l'arrivée qu'on vient de relire — pas « la courante ».
   *   Entre l'affichage et le clic, une livraison a pu remplacer celle-ci, et
   *   c'est précisément ce que le serveur doit pouvoir refuser plutôt que de
   *   valider autre chose que ce qui était à l'écran.
   */
  async accept(deliveryId: string, excludedSkus: readonly string[]): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/catalog/delivery/accept`, {
        deliveryId,
        excludedSkus,
      }),
    );
  }
}
