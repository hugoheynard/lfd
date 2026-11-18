import { inject, Injectable, signal } from '@angular/core';

import type { PackingFoundBody, PackingProblemBody, PackingSheet } from '@lfd/contracts';

import { GestureIntents } from '../../shared/gesture-intents';
import { PackingService } from '../packing.service';
import { serverMessageOf } from '../server-message';
import { PackingDayReader } from './packing-day.reader';

/**
 * **Le colisage simple d'un retrait** — « Tout est prêt », « Problème » et
 * « Pièces retrouvées » (plan `colisage/plan-niveaux-de-suivi-colisage.md`,
 * D4 à D6) : l'envoi, son état et son refus.
 *
 * Fourni par l'écran (`providers` de `Colisage`), comme les gestes voisins.
 * Chaque geste porte une clé d'intention par commande ({@link GestureIntents}),
 * gardée jusqu'au succès : un réessai après une coupure ne double rien. Un
 * geste accepté finit par la relecture du poste ; un refus garde ses mots.
 */
@Injectable()
export class PackingSimpleGestures {
  private readonly api = inject(PackingService);
  private readonly day = inject(PackingDayReader);
  private readonly intents = new GestureIntents();

  private readonly inFlight = signal(false);
  /** Un geste en vol, relecture comprise — les boutons se désarment. */
  readonly busy = this.inFlight.asReadonly();

  private readonly refused = signal<string | null>(null);
  /** Le dernier refus du serveur, tel quel. */
  readonly refusal = this.refused.asReadonly();

  /** Oublie le refus — une autre commande est ouverte. */
  forget(): void {
    this.refused.set(null);
  }

  /** « Tout est prêt » — rend `true` si le serveur l'a accepté. */
  allReady(sheet: PackingSheet): Promise<boolean> {
    if (!sheet.allReadyAvailable) {
      return Promise.resolve(false);
    }
    return this.once(`all-ready|${sheet.orderId}`, (date, key) =>
      this.api.allReady(date, sheet.orderId, key),
    );
  }

  /** « Problème » : ce qui est vraiment là, par produit. */
  reportProblem(sheet: PackingSheet, body: PackingProblemBody): Promise<boolean> {
    return this.once(`problem|${sheet.orderId}`, (date, key) =>
      this.api.reportProblem(date, sheet.orderId, body, key),
    );
  }

  /** « Pièces retrouvées » : ce qui revient à la réserve, par produit. */
  recoverFound(sheet: PackingSheet, body: PackingFoundBody): Promise<boolean> {
    if (body.lines.length === 0) {
      return Promise.resolve(false);
    }
    return this.once(`found|${sheet.orderId}`, (date, key) =>
      this.api.recoverFound(date, sheet.orderId, body, key),
    );
  }

  private async once(
    subject: string,
    gesture: (date: string, intentKey: string) => Promise<void>,
  ): Promise<boolean> {
    if (this.inFlight()) {
      return false;
    }
    this.inFlight.set(true);
    this.refused.set(null);
    try {
      await gesture(this.day.date(), this.intents.keyFor(subject));
    } catch (error) {
      this.refused.set(serverMessageOf(error));
      this.inFlight.set(false);
      return false;
    }
    this.intents.done(subject);
    await this.day.rereadAfterWrite();
    this.inFlight.set(false);
    return true;
  }
}
