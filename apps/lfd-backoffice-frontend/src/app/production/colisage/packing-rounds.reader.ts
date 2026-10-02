import { inject, Injectable, signal } from '@angular/core';
import type { DeliveryPackingRoundView } from '@lfd/contracts';

import { DeliveryLoadingService } from '../../livraison/delivery-loading.service';

/**
 * **Où vont les commandes du poste** (lot PC2) — la lecture que le poste fait
 * côté LIVRAISON, à côté de celle du fournil.
 *
 * 🔴 Le fournil n'importe pas la livraison (`production → delivery` = ✗) :
 * c'est l'écran qui lit les deux, comme le panneau « Bacs ». Un échec ne
 * casse pas le poste — les commandes restent dans l'ordre servi, et l'échec se
 * dit (`failed`).
 *
 * Fourni par le poste, pas à la racine : un poste ouvert deux fois ne partage
 * pas sa lecture.
 */
@Injectable()
export class PackingRoundsReader {
  private readonly service = inject(DeliveryLoadingService);

  private readonly served = signal<readonly DeliveryPackingRoundView[]>([]);
  readonly rounds = this.served.asReadonly();

  private readonly readFailed = signal(false);
  readonly failed = this.readFailed.asReadonly();

  private seq = 0;

  /** Lit les tournées de la journée. Une réponse devancée par une plus récente est jetée. */
  async load(day: string): Promise<void> {
    this.seq += 1;
    const seq = this.seq;
    try {
      const view = await this.service.packingRounds(day);
      if (seq === this.seq) {
        this.served.set(view.rounds);
        this.readFailed.set(false);
      }
    } catch {
      if (seq === this.seq) {
        this.readFailed.set(true);
      }
    }
  }
}
