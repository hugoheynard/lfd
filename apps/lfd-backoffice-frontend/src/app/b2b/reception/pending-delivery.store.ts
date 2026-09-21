import { inject, Injectable, signal } from '@angular/core';
import type { PendingDeliveryView } from '@lfd/contracts';

import { ReceptionService } from './reception.service';

/**
 * **Ce qui attend d'être relu**, partagé par l'espace B2B et son écran de
 * réception.
 *
 * Une seule source pour un seul fait. L'écran de réception portait sa propre
 * copie ; le bandeau de l'espace en aurait fait une seconde, et deux copies du
 * même fait finissent toujours par diverger — ici, ç'aurait été un bandeau qui
 * survit à la validation qu'on vient de faire.
 *
 * **`refresh()` LÈVE**, et c'est délibéré : ce que veut dire un échec dépend de
 * qui demande. L'écran de réception l'affiche (on y est venu pour ça) ; le
 * bandeau l'avale, parce que la chrome n'est pas l'endroit où l'on diagnostique
 * une panne et qu'un bandeau fantôme enverrait quelqu'un sur un écran vide.
 * C'est le raisonnement de `NavCountsService`, et il vaut deux fois ici : le
 * bandeau nomme un geste à faire.
 *
 * **Aucun sondage.** Le store se charge en entrant dans l'espace B2B et se
 * rafraîchit quand une arrivée est traitée. Une livraison qui tombe pendant
 * qu'on est déjà posé sur un écran ne se voit donc qu'à la navigation suivante
 * — compromis assumé, le même que celui des compteurs du menu : à cinq
 * personnes dans le back-office, une requête toutes les trente secondes
 * coûterait plus qu'elle n'apprendrait.
 */
@Injectable({ providedIn: 'root' })
export class PendingDeliveryStore {
  private readonly reception = inject(ReceptionService);

  /** `null` = rien n'attend, l'état normal d'une plateforme à jour. */
  readonly pending = signal<PendingDeliveryView | null>(null);

  /** @throws l'erreur du transport, telle quelle — l'appelant décide. */
  async refresh(): Promise<void> {
    this.pending.set(await this.reception.pending());
  }

  /**
   * Rafraîchit sans jamais échouer, pour les appelants qui ne peuvent rien
   * faire d'une erreur. Un échec remet à `null` plutôt que de laisser en place
   * un bandeau qui ne correspond peut-être plus à rien.
   */
  async refreshQuietly(): Promise<void> {
    try {
      await this.refresh();
    } catch {
      this.pending.set(null);
    }
  }
}
