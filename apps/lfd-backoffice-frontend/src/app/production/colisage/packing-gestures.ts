import { inject, Injectable, signal } from '@angular/core';

import type { PackingSheet } from '@lfd/contracts';

import { PackingService } from '../packing.service';
import { serverMessageOf } from '../server-message';
import { PackingDayReader } from './packing-day.reader';

/**
 * **CE QU'ON FAIT** à une commande du poste de colisage — la déclarer prête,
 * rouvrir son rangement — avec l'état de chaque envoi et de chaque échec.
 *
 * Fourni par l'écran (`providers` de `Colisage`), comme {@link PackingDayReader}
 * qu'il injecte. Sorti de `Colisage` le 2026-09-14. Depuis K3b
 * (`colisage/colisage.md` §17), les deux gestes vont au colisage ;
 * la coche de ligne et le compte « + / − » du fournil ont disparu. Répartir dans
 * les contenants est à `PackingContainerGestures`.
 *
 * 🔴 **Une seule dépendance, dans un seul sens** : chaque geste accepté finit par
 * la relecture d'après écriture du lecteur. Le lecteur, lui, ne connaît pas les
 * gestes.
 */
@Injectable()
export class PackingGestures {
  private readonly api = inject(PackingService);
  private readonly day = inject(PackingDayReader);

  /** Une déclaration en vol, relecture comprise — le bouton se désarme. */
  private readonly declaring = signal(false);
  readonly closing = this.declaring.asReadonly();

  /**
   * La déclaration vient d'échouer : rien n'a été annoncé au commerce. Porte la
   * raison du serveur — un `409` dit qu'il reste des pièces à répartir.
   */
  private readonly declareRefused = signal<string | null>(null);
  readonly closeFailed = this.declareRefused.asReadonly();

  /** Une réouverture en vol. */
  private readonly reopeningSignal = signal(false);
  readonly reopening = this.reopeningSignal.asReadonly();

  /** La réouverture vient d'être refusée — la raison du serveur, telle quelle. */
  private readonly reopenRefused = signal<string | null>(null);
  readonly reopenFailed = this.reopenRefused.asReadonly();

  /** Oublie les échecs qui portent sur UNE commande — quand on en ouvre une autre, ou qu'on relit. */
  forgetOrderFailures(): void {
    this.declareRefused.set(null);
    this.reopenRefused.set(null);
  }

  /**
   * « Déclarer prête » est-il permis ? **La règle du serveur**
   * (`canDeclareReady`), et rien d'autre que le geste en vol.
   */
  canDeclare(sheet: PackingSheet): boolean {
    return sheet.canDeclareReady && !this.declaring();
  }

  /**
   * **Déclare la commande prête**, puis relit. Un échec reste à l'écran.
   *
   * Rend `true` si la déclaration a été acceptée : l'écran enchaîne alors sur la
   * commande suivante.
   */
  async declare(sheet: PackingSheet): Promise<boolean> {
    if (!this.canDeclare(sheet)) {
      return false;
    }
    this.declaring.set(true);
    this.declareRefused.set(null);
    try {
      await this.api.closeOrder(this.day.date(), sheet.orderId);
    } catch (error) {
      this.declareRefused.set(serverMessageOf(error));
      this.declaring.set(false);
      return false;
    }
    await this.day.rereadAfterWrite();
    this.declaring.set(false);
    return true;
  }

  /**
   * **Rouvre le rangement** d'une commande déclarée prête, puis relit. La
   * commande reste prête au commerce ; le serveur refuse si un bac est chargé ou
   * la tournée partie, et son message s'affiche tel quel.
   *
   * Rend `true` si la réouverture a été acceptée.
   */
  async reopen(sheet: PackingSheet): Promise<boolean> {
    if (sheet.packedAt === null || this.reopeningSignal()) {
      return false;
    }
    this.reopeningSignal.set(true);
    this.reopenRefused.set(null);
    try {
      await this.api.reopenOrder(this.day.date(), sheet.orderId);
    } catch (error) {
      this.reopenRefused.set(serverMessageOf(error));
      this.reopeningSignal.set(false);
      return false;
    }
    await this.day.rereadAfterWrite();
    this.reopeningSignal.set(false);
    return true;
  }
}
