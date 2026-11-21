import { inject, Injectable, signal } from '@angular/core';

import type { WorkshopBatch, WorkshopLine } from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { GestureFeedback } from '../../../shared/gesture-feedback/gesture-feedback';
import { GestureIntents } from '../../../shared/gesture-intents';
import { ulid } from '../../../shared/ulid';
import { markKey } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';
import { WorkshopDayReader } from './workshop-day.reader';
import {
  BATCH_KEPT,
  DONE_KEPT,
  GestureKept,
  isOffline,
  reasonOf,
} from '../rules/workshop-send-errors';
import { WorkshopOutbox } from '../outbox/workshop-outbox';
import { WorkshopProblemOpener } from '../openers/workshop-problem-opener';

/**
 * La dernière fournée acceptée, pour « Annuler la dernière » (plan
 * `documentation/fournil/la-fiche-d-atelier.md` §4.5) : son `id` est celui que
 * l'écran a tiré, donc celui que le serveur a gardé.
 */
export interface LastBatch {
  readonly line: WorkshopLine;
  readonly id: string;
  readonly quantity: number;
}

/**
 * **CE QU'ON FAIT** à la fiche d'atelier — déclarer une fournée, en annuler
 * une, retirer — avec l'état de chaque envoi et de chaque échec
 * (`la-fiche-d-atelier.md`, D3, D5).
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
  private readonly problems = inject(WorkshopProblemOpener);
  /** Vibration et annonce : le résultat se sent sans regarder l'écran. */
  private readonly feedback = inject(GestureFeedback);

  /** « Fait » par intention : un double appui ne déclare qu'une fois (`fournil/les-niveaux-de-suivi.md`). */
  private readonly intents = new GestureIntents();

  /**
   * Le dernier geste refusé, dit en entier, avec la raison du SERVEUR — « pièces
   * au bac », conflit d'idempotence : les mots sont les siens.
   */
  private readonly refusal = signal<string | null>(null);
  readonly refused = this.refusal.asReadonly();

  /** Le retirage vient-il d'échouer ? Un échec partiel, la fiche reste à l'écran. */
  private readonly retakeRefused = signal(false);
  readonly retakeFailed = this.retakeRefused.asReadonly();

  private readonly lastAccepted = signal<LastBatch | null>(null);
  /** La dernière fournée acceptée ; `null` une fois annulée ou oubliée. */
  readonly last = this.lastAccepted.asReadonly();

  /** Les fournées parties sans réponse, gardées sur l'appareil. */
  private readonly outbox = inject(WorkshopOutbox);

  /** Un geste de cette ligne est-il en train de partir ? */
  isBusy(line: WorkshopLine): boolean {
    const date = this.day.date();
    return date !== null && this.day.busy().has(markKey(date, line.sku));
  }

  /**
   * Déclare une fournée de `quantity` pièces sur la ligne, puis relit.
   *
   * Sans réponse du serveur, la fournée est **gardée dans la file** sous son
   * `id`, et repart seule au retour du réseau ; un nouvel appui de la même
   * quantité sur la même ligne la rejoue au lieu d'en créer une seconde.
   */
  async record(line: WorkshopLine, quantity: number): Promise<void> {
    // Tiré dans l'envoi : une boîte, que la fermeture remplit.
    const sent: { id: string | null } = { id: null };
    const accepted = await this.send(
      line,
      async (date, key) => {
        const id = this.outbox.findBatch(date, line.sku, quantity)?.id ?? ulid();
        const initials = this.initials();
        this.outbox.setSending(key, quantity);
        try {
          await this.api.recordBatch(date, line.sku, id, { quantity, initials });
          this.outbox.remove(id);
          sent.id = id;
        } catch (error) {
          if (isOffline(error)) {
            this.outbox.add({
              kind: 'batch',
              id,
              date,
              sku: line.sku,
              productName: line.productName,
              quantity,
              initials,
            });
            throw new GestureKept(BATCH_KEPT);
          }
          throw error;
        } finally {
          this.outbox.setSending(key, null);
        }
      },
      'La fournée n’a pas été enregistrée',
      `Fournée enregistrée — ${line.productName}, ${String(quantity)}`,
    );
    if (accepted && sent.id !== null) {
      this.lastAccepted.set({ line, id: sent.id, quantity });
    }
  }

  /** Un refus arrivé hors d'un geste (la file renvoyée) : dit comme les autres. */
  sayRefused(said: string): void {
    this.refusal.set(said);
    this.feedback.refused(said);
  }

  /**
   * **« Fait »** (niveau simple) : le serveur déclare le reste sous le plafond.
   * L'écran n'envoie aucune quantité. La clé de l'intention reste celle de la
   * ligne tant que le geste n'a pas abouti.
   */
  async markDone(line: WorkshopLine): Promise<void> {
    const sent: { subject: string | null } = { subject: null };
    const accepted = await this.send(
      line,
      async (date) => {
        const subject = `done|${date}|${line.sku}`;
        // Gardé sans réseau, le geste repart sous la clé qu'il avait.
        const id = this.outbox.findDone(date, line.sku)?.id ?? this.intents.keyFor(subject);
        try {
          await this.api.markDone(date, line.sku, id);
          this.outbox.remove(id);
        } catch (error) {
          if (isOffline(error)) {
            this.outbox.add({
              kind: 'done',
              id,
              date,
              sku: line.sku,
              productName: line.productName,
            });
            throw new GestureKept(DONE_KEPT);
          }
          throw error;
        }
        sent.subject = subject;
      },
      'La ligne n’a pas été marquée faite',
      `${line.productName} : faite`,
    );
    if (accepted && sent.subject !== null) {
      this.intents.done(sent.subject);
    }
  }

  /**
   * **« Problème »** : ouvre le panneau rouge, qui envoie lui-même ; un
   * signalement pris fait relire la fiche.
   */
  async reportProblem(line: WorkshopLine): Promise<void> {
    const date = this.day.date();
    if (date === null || this.isBusy(line)) {
      return;
    }
    this.refusal.set(null);
    // La ligne est occupée tant que le panneau est ouvert : un second appui
    // n'en ouvre pas un autre.
    const key = markKey(date, line.sku);
    this.day.setBusy(key, true);
    try {
      if (await this.problems.openFor(date, line)) {
        await this.day.rereadAfterWrite();
      }
    } catch (error) {
      // Le panneau n'a pas pu s'ouvrir ou envoyer : le dire, pas le perdre.
      this.sayRefused(
        `Le problème n’a pas pu être signalé — ${line.productName} : ${reasonOf(error)}`,
      );
    } finally {
      this.day.setBusy(key, false);
    }
  }

  /**
   * « Annuler » du bandeau : annule la dernière fournée acceptée, puis relit.
   * Elle n'est oubliée qu'une fois annulée : refusée, l'annulation reste offerte
   * par le bandeau. Un second appui pendant l'envoi est ignoré (ligne occupée).
   */
  async undoLast(): Promise<void> {
    const last = this.lastAccepted();
    if (last === null) {
      return;
    }
    const cancelled = await this.send(
      last.line,
      (date) => this.api.cancelBatch(date, last.id),
      'La fournée n’a pas été annulée',
      `Fournée annulée — ${last.line.productName}`,
    );
    if (cancelled && this.lastAccepted()?.id === last.id) {
      this.lastAccepted.set(null);
    }
  }

  /** Le bandeau s'est refermé : la dernière fournée ne s'annule plus que par sa puce. */
  forgetLast(): void {
    this.lastAccepted.set(null);
  }

  /** Annule une fournée de la ligne — n'importe quel poste le peut —, puis relit. */
  async cancel(line: WorkshopLine, batch: WorkshopBatch): Promise<void> {
    if (this.lastAccepted()?.id === batch.id) {
      this.lastAccepted.set(null);
    }
    await this.send(
      line,
      (date) => this.api.cancelBatch(date, batch.id),
      'La fournée n’a pas été annulée',
      `Fournée annulée — ${line.productName}`,
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
   * l'envoi ; refusé, le geste est DIT ; accepté, la fiche est relue. Rend
   * `true` quand le serveur a accepté.
   */
  private async send(
    line: WorkshopLine,
    write: (date: string, key: string) => Promise<void>,
    failure: string,
    success: string,
  ): Promise<boolean> {
    // La date est prise UNE fois : la clé et l'envoi parlent de la même journée,
    // même si une relecture la change pendant l'envoi.
    const date = this.day.date();
    if (date === null) {
      return false;
    }
    const key = markKey(date, line.sku);
    if (this.day.busy().has(key)) {
      return false;
    }
    this.refusal.set(null);
    this.day.setBusy(key, true);
    try {
      await write(date, key);
    } catch (error) {
      this.day.setBusy(key, false);
      const said = `${failure} — ${line.productName} : ${reasonOf(error)}`;
      this.refusal.set(said);
      this.feedback.refused(said);
      return false;
    }
    this.feedback.accepted(success);
    await this.day.rereadAfterWrite();
    this.day.setBusy(key, false);
    return true;
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
