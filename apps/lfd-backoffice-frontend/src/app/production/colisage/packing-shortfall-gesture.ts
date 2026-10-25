import { inject, Injectable, signal } from '@angular/core';

import type { PackingSheet } from '@lfd/contracts';

import { PackingService } from '../packing.service';
import { serverMessageOf } from '../server-message';
import { PackingDayReader } from './packing-day.reader';

/**
 * **« Il manque »** au poste de colisage (lot E6a,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3) — l'envoi, son
 * état et son refus.
 *
 * Fourni par l'écran (`providers` de `Colisage`), comme {@link PackingGestures}.
 * Un geste à part plutôt qu'une méthode de plus là-bas : il n'a rien en commun
 * avec « Déclarer prête » que la relecture d'après écriture.
 */
@Injectable()
export class PackingShortfallGesture {
  private readonly api = inject(PackingService);
  private readonly day = inject(PackingDayReader);

  private readonly sending = signal(false);
  /** Un signalement en vol, relecture comprise — le bouton se désarme. */
  readonly reporting = this.sending.asReadonly();

  private readonly refused = signal<string | null>(null);
  /** Le signalement vient d'être refusé — la raison du serveur, telle quelle. */
  readonly failed = this.refused.asReadonly();

  /** Oublie le refus — quand on ouvre une autre commande. */
  forget(): void {
    this.refused.set(null);
  }

  /** Signale le manque, puis relit. Rend `true` si le serveur l'a accepté. */
  async report(sheet: PackingSheet): Promise<boolean> {
    if (!sheet.canReportShortfall || this.sending()) {
      return false;
    }
    this.sending.set(true);
    this.refused.set(null);
    try {
      await this.api.reportShortfall(this.day.date(), sheet.orderId);
    } catch (error) {
      this.refused.set(serverMessageOf(error));
      this.sending.set(false);
      return false;
    }
    await this.day.rereadAfterWrite();
    this.sending.set(false);
    return true;
  }
}
