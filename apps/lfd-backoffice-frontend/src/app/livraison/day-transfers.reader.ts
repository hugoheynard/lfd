import { computed, inject, Injectable, signal } from '@angular/core';
import type { DayInternalTransfersView, DayInternalTransferView } from '@lfd/contracts';

import { DeliveryTransfersService } from './delivery-transfers.service';

/**
 * **Les transferts d'une journée, vus d'un écran qui n'est pas la livraison**
 * (Hugo, 2026-11-01) — le poste de colisage et la Supervision montrent déjà
 * l'encadré d'un site servi par transfert ; ils y lisent ici de quoi ouvrir le
 * manifeste.
 *
 * Un échec ne casse rien : la liste se vide (`failed`), et l'encadré ne
 * propose pas le manifeste plutôt qu'un transfert peut-être périmé. Fourni par l'écran, pas à la racine.
 */
@Injectable()
export class DayTransfersReader {
  private readonly service = inject(DeliveryTransfersService);

  private readonly served = signal<DayInternalTransfersView | null>(null);
  /** La vue lue, avec son jour ; `null` tant que rien n'est lu, ou après un échec. */
  readonly view = this.served.asReadonly();
  readonly transfers = computed<readonly DayInternalTransferView[]>(
    () => this.served()?.transfers ?? [],
  );

  private readonly readFailed = signal(false);
  /** La dernière lecture a échoué : l'écran peut le dire. */
  readonly failed = this.readFailed.asReadonly();

  private seq = 0;

  /** Lit les transferts du jour. Une réponse devancée par une plus récente est jetée. */
  async load(day: string): Promise<void> {
    this.seq += 1;
    const seq = this.seq;
    try {
      const view = await this.service.ofDay(day);
      if (seq === this.seq) {
        this.served.set(view);
        this.readFailed.set(false);
      }
    } catch {
      if (seq === this.seq) {
        this.served.set(null);
        this.readFailed.set(true);
      }
    }
  }
}

/** Les transferts d'un site, dans l'ordre servi. */
export function transfersOfSite(
  transfers: readonly DayInternalTransferView[],
  siteId: string,
): readonly DayInternalTransferView[] {
  return transfers.filter((transfer) => transfer.siteId === siteId);
}
