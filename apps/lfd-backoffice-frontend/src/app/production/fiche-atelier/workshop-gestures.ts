import { inject, Injectable, signal } from '@angular/core';

import type { WorkshopLine } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { serverMessageOf } from '../server-message';
import { markKey } from '../worksheet-day';
import { WorksheetService } from '../worksheet.service';
import { WorkshopDayReader } from './workshop-day.reader';

/**
 * **CE QU'ON FAIT** à la fiche d'atelier — cocher, retirer — avec l'état de
 * chaque envoi et de chaque échec.
 *
 * Fourni par l'écran, comme {@link WorkshopDayReader} qu'il injecte. Même découpe
 * que `PackingGestures` (2026-09-14) : chaque geste accepté finit par une
 * relecture ; le lecteur ne connaît pas les gestes.
 *
 * Aucun chiffre n'est écrit ici — la ligne change de liste à la relecture qui
 * suit la coche, pas avant, et c'est voulu.
 */
@Injectable()
export class WorkshopGestures {
  private readonly api = inject(WorksheetService);
  private readonly permissions = inject(PermissionsStore);
  private readonly day = inject(WorkshopDayReader);

  /**
   * La dernière coche refusée, avec le produit et la raison du serveur.
   * 🔴 La case est revenue en arrière : il reste à le DIRE. Une coche qui se
   * défait sans explication se recoche, et se refait refuser.
   */
  private readonly markRefused = signal<string | null>(null);
  readonly markFailed = this.markRefused.asReadonly();

  /** Le retirage vient-il d'échouer ? Un échec partiel, la fiche reste à l'écran. */
  private readonly retakeRefused = signal(false);
  readonly retakeFailed = this.retakeRefused.asReadonly();

  /** La coche de cette ligne est-elle en train de partir ? */
  isBusy(line: WorkshopLine): boolean {
    const date = this.day.date();
    return date !== null && this.day.busy().has(markKey(date, line.sku));
  }

  /**
   * Coche ou décoche une ligne, puis **relit**.
   *
   * La case se coche avant la réponse et se désarme le temps de l'envoi : un
   * second geste contraire pourrait arriver avant le premier, et le serveur
   * garderait le mauvais. Refusée, elle revient en arrière et l'écran dit pourquoi.
   */
  async toggle(line: WorkshopLine, done: boolean): Promise<void> {
    // La date est prise UNE fois : la clé de la case et l'envoi parlent de la
    // même journée, même si une relecture la change pendant l'envoi.
    const date = this.day.date();
    if (date === null) {
      return;
    }
    const key = markKey(date, line.sku);
    if (this.day.busy().has(key)) {
      return;
    }
    const initials = this.initials();
    this.markRefused.set(null);
    this.day.setShown(key, done);
    this.day.setBusy(key, true);
    try {
      await this.api.mark(date, line.sku, done, initials);
    } catch (error) {
      this.day.setBusy(key, false);
      this.day.setShown(key, null);
      this.markRefused.set(`${line.productName} — ${serverMessageOf(error)}`);
      return;
    }
    const read = await this.day.rereadAfterWrite();
    this.day.setBusy(key, false);
    // Relue : l'état montré cède la place au serveur. Pas relue : il reste — le
    // geste a été ACCEPTÉ — jusqu'à la prochaine lecture inscrite.
    if (read) {
      this.day.setShown(key, null);
    }
  }

  /** Absorbe ce qui est arrivé depuis le tirage, puis relit la fiche. */
  async retake(): Promise<void> {
    const date = this.day.date();
    if (date === null) {
      return;
    }
    this.retakeRefused.set(false);
    try {
      await this.api.retake(date);
    } catch {
      this.retakeRefused.set(true);
      return;
    }
    await this.day.load();
  }

  /**
   * Les initiales de qui coche, prises sur la personne connectée.
   *
   * ⚠️ Le plan ne dit pas d'où elles viennent. Les demander à l'écran ferait
   * taper deux lettres les doigts farinés à chaque ligne ; les déduire du nom est
   * la seule source non inventée dont l'écran dispose (tranché le 2026-09-13, à
   * revoir si le fournil signe au nom de son poste et non du sien).
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}
