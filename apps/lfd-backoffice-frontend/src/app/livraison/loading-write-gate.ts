import { signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { type LoadingNotice, refusalNotice } from './delivery-loading-notice';

/**
 * **Une écriture à la fois, puis une relecture** — le garde des gestes de
 * l'écran « Charger » (charger, décharger, partir), sorti du composant
 * `LoadingRound`. Un geste pendant qu'un autre est en vol est ignoré ; un
 * refus du serveur devient l'avis affiché, tel quel ; la tournée se relit
 * dans les deux cas, parce qu'un refus peut venir d'un état déjà changé.
 */
export class LoadingWriteGate {
  /** Le dernier avis : un bac chargé, un bac d'ailleurs, un refus. */
  readonly notice = signal<LoadingNotice | null>(null);
  readonly busy = signal(false);

  constructor(private readonly reread: () => Promise<void>) {}

  /** Vrai si le serveur a accepté. */
  async run(gesture: () => Promise<void>, fallback: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.notice.set(null);
    let accepted = false;
    try {
      await gesture();
      accepted = true;
    } catch (error) {
      this.notice.set(refusalNotice(httpErrorMessage(error, fallback)));
    } finally {
      await this.reread();
      this.busy.set(false);
    }
    return accepted;
  }
}
