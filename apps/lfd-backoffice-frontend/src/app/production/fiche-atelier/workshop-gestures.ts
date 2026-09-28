import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';

import type { WorkshopBatch, WorkshopLine } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { ulid } from '../../shared/ulid';
import { serverMessageOf } from '../server-message';
import { markKey } from '../worksheet-day';
import { WorksheetService } from '../worksheet.service';
import { WorkshopDayReader } from './workshop-day.reader';

/**
 * La réponse n'est pas arrivée : le serveur a peut-être écrit. On ne reprend
 * pas `serverMessageOf`, qui dirait « rien n'a été enregistré » — c'est
 * justement ce qu'on ne sait pas.
 */
const NO_ANSWER =
  'Le serveur n’a pas répondu — réessayez : la même fournée ne comptera pas deux fois.';

/** Une fournée partie sans réponse, gardée pour être rejouée sous le même `id`. */
interface Unanswered {
  readonly id: string;
  readonly quantity: number;
}

/**
 * **CE QU'ON FAIT** à la fiche d'atelier — déclarer une fournée, en annuler
 * une, retirer — avec l'état de chaque envoi et de chaque échec
 * (`plan-fournees-progressives.md`, D3, D5).
 *
 * Fourni par l'écran, comme {@link WorkshopDayReader} qu'il injecte. Chaque
 * geste accepté finit par une relecture : aucun chiffre n'est calculé ici, la
 * barre avance quand le serveur l'a dit.
 *
 * 🔴 **Un double appui ne crée pas deux fournées.** La ligne est désarmée le
 * temps de l'envoi, et un second geste sur elle est ignoré. Une fournée partie
 * sans réponse garde son `id` : le même geste rejoué le réutilise, et
 * l'idempotence du serveur l'absorbe s'il avait déjà écrit.
 */
@Injectable()
export class WorkshopGestures {
  private readonly api = inject(WorksheetService);
  private readonly permissions = inject(PermissionsStore);
  private readonly day = inject(WorkshopDayReader);

  /**
   * Le dernier geste refusé, dit en entier, avec la raison du SERVEUR — « pièces
   * au bac », conflit d'idempotence : les mots sont les siens.
   */
  private readonly refusal = signal<string | null>(null);
  readonly refused = this.refusal.asReadonly();

  /** Le retirage vient-il d'échouer ? Un échec partiel, la fiche reste à l'écran. */
  private readonly retakeRefused = signal(false);
  readonly retakeFailed = this.retakeRefused.asReadonly();

  /** Par ligne, la fournée partie sans réponse. */
  private readonly unanswered = new Map<string, Unanswered>();

  /** Un geste de cette ligne est-il en train de partir ? */
  isBusy(line: WorkshopLine): boolean {
    const date = this.day.date();
    return date !== null && this.day.busy().has(markKey(date, line.sku));
  }

  /** Déclare une fournée de `quantity` pièces sur la ligne, puis relit. */
  async record(line: WorkshopLine, quantity: number): Promise<void> {
    await this.send(
      line,
      async (date, key) => {
        const retried = this.unanswered.get(key);
        const id = retried?.quantity === quantity ? retried.id : ulid();
        this.unanswered.delete(key);
        try {
          await this.api.recordBatch(date, line.sku, id, { quantity, initials: this.initials() });
        } catch (error) {
          if (error instanceof HttpErrorResponse && error.status === 0) {
            this.unanswered.set(key, { id, quantity });
          }
          throw error;
        }
      },
      'La fournée n’a pas été enregistrée',
    );
  }

  /** Annule une fournée de la ligne — n'importe quel poste le peut —, puis relit. */
  async cancel(line: WorkshopLine, batch: WorkshopBatch): Promise<void> {
    await this.send(
      line,
      (date) => this.api.cancelBatch(date, batch.id),
      'La fournée n’a pas été annulée',
    );
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
   * Le cadre commun des deux gestes : une ligne à la fois, désarmée le temps de
   * l'envoi ; refusé, le geste est DIT ; accepté, la fiche est relue.
   */
  private async send(
    line: WorkshopLine,
    write: (date: string, key: string) => Promise<void>,
    failure: string,
  ): Promise<void> {
    // La date est prise UNE fois : la clé et l'envoi parlent de la même journée,
    // même si une relecture la change pendant l'envoi.
    const date = this.day.date();
    if (date === null) {
      return;
    }
    const key = markKey(date, line.sku);
    if (this.day.busy().has(key)) {
      return;
    }
    this.refusal.set(null);
    this.day.setBusy(key, true);
    try {
      await write(date, key);
    } catch (error) {
      this.day.setBusy(key, false);
      this.refusal.set(`${failure} — ${line.productName} : ${this.reasonOf(error)}`);
      return;
    }
    await this.day.rereadAfterWrite();
    this.day.setBusy(key, false);
  }

  private reasonOf(error: unknown): string {
    return error instanceof HttpErrorResponse && error.status === 0
      ? NO_ANSWER
      : serverMessageOf(error);
  }

  /**
   * Les initiales de qui déclare, prises sur la personne connectée — la même
   * source que l'ancienne coche.
   *
   * ⚠️ Le plan ne dit pas d'où elles viennent. Les demander à l'écran ferait
   * taper deux lettres les doigts farinés à chaque fournée ; les déduire du nom
   * est la seule source non inventée dont l'écran dispose (tranché le
   * 2026-09-13, à revoir si le fournil signe au nom de son poste).
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}
