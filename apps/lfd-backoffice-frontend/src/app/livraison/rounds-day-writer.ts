import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import type { OrderLists } from './delivery-rounds';
import { DeliveryRoundsService } from './delivery-rounds.service';
import { POOL_KEY } from './rounds-board-model';
import { layoutOps, type LayoutOp, listsOf } from './rounds-board-lists';
import { RoundsDay } from './rounds-day';

/** Ce qu'on dit quand le serveur refuse une composition devenue périmée, sans phrase à lui. */
const CHANGED = 'La composition a changé entre-temps : elle vient d’être relue.';
/** Le statut d'un refus parce que la composition a changé. */
export const CONFLICT = 409;

/**
 * **Les écritures de l'organisateur** — une à la fois, toujours relues —,
 * sorties de `RoundsPage` avec la traduction d'un geste en affectations,
 * déplacements, retraits et permutations ENTIÈRES (I2).
 *
 * Aucune écriture n'est rejouée : un refus parce que la composition a changé
 * (409) s'affiche et relit. Fourni par la page, comme {@link RoundsDay} qu'il
 * relit.
 */
@Injectable()
export class RoundsDayWriter {
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly day = inject(RoundsDay);

  /** Le dernier refus du serveur — la composition reste à l'écran. */
  readonly refusal = signal<string | null>(null);
  /** Une écriture en vol : une seule à la fois, les contrôles attendent. */
  readonly busy = signal(false);

  /** Une écriture : une à la fois, relue ensuite ; `true` si elle a abouti. */
  async write(gesture: () => Promise<void>, fallback: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      await this.day.load(this.day.day());
      return true;
    } catch (error) {
      // Un 409 dit que la composition affichée est périmée. Jamais un nouvel
      // essai en silence : il écraserait ce qu'un collègue vient de faire.
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      this.refusal.set(httpErrorMessage(error, changed ? CHANGED : fallback));
      // Relire dans tous les cas : un tableau resté sur le geste refusé
      // mentirait sur la tournée de l'arrêt.
      await this.day.load(this.day.day());
      return false;
    } finally {
      this.day.optimistic.set(null);
      this.busy.set(false);
    }
  }

  /**
   * Écrit des listes visées : d'abord qui change de tournée, puis l'ordre de
   * chaque tournée touchée, en permutation ENTIÈRE (I2). Chaque écriture relit
   * avant la suivante — les versions et les arrêts créés en dépendent.
   *
   * `force` renvoie la permutation même si la composition lue la porte déjà :
   * « Annuler » renvoie exactement celle d'avant.
   */
  writeLayout(desired: OrderLists, force: boolean): Promise<boolean> {
    const board = this.day.liveBoard();
    if (board === null) {
      return Promise.resolve(false);
    }
    const ops = layoutOps(listsOf(board), desired);
    this.day.optimistic.set(desired);
    return this.write(async () => {
      for (const op of ops) {
        await this.perform(op);
        await this.day.load(this.day.day());
      }
      for (const [key, wanted] of Object.entries(desired)) {
        if (key !== POOL_KEY && (await this.reorder(key, wanted, force))) {
          await this.day.load(this.day.day());
        }
      }
    }, 'La composition n’a pas pu être enregistrée.');
  }

  private async perform(op: LayoutOp): Promise<void> {
    if (op.kind === 'assign') {
      const target = this.day.roundById(op.to);
      if (target !== null) {
        await this.rounds.assign(target.round.id, {
          orderId: op.orderId,
          version: target.round.version,
        });
      }
      return;
    }
    const from = this.day.roundById(op.from);
    const stop = from?.stops.find((line) => line.stop.orderId === op.orderId)?.stop;
    if (from === null || stop === undefined) {
      return;
    }
    if (op.kind === 'remove') {
      await this.rounds.remove(from.round.id, stop.stopId, { version: from.round.version });
      return;
    }
    const target = this.day.roundById(op.to);
    if (target !== null) {
      await this.rounds.move(from.round.id, stop.stopId, {
        toRoundId: target.round.id,
        fromVersion: from.round.version,
        toVersion: target.round.version,
      });
    }
  }

  /** La permutation entière d'une tournée, si elle porte bien ces commandes-là. */
  private async reorder(key: string, wanted: readonly string[], force: boolean): Promise<boolean> {
    const current = this.day.roundById(key);
    if (current === null || wanted.length === 0) {
      return false;
    }
    const stopIds = new Map(current.stops.map(({ stop }) => [stop.orderId, stop.stopId]));
    const same = wanted.length === current.stops.length && wanted.every((id) => stopIds.has(id));
    const unchanged = wanted.every((id, index) => current.stops[index]?.stop.orderId === id);
    if (!same || (unchanged && !force)) {
      return false;
    }
    await this.rounds.reorder(current.round.id, {
      stopIds: wanted.map((id) => stopIds.get(id) ?? id),
      version: current.round.version,
    });
    return true;
  }

  /**
   * « Placer ici » (CA7) : l'affectation existante, au rang suggéré, sous la
   * version LUE AVEC la suggestion — une tournée qui a bougé depuis refuse
   * (409), et la composition est relue avec ses nouvelles suggestions.
   */
  placeSuggested(orderId: string): Promise<boolean> {
    const suggestion = this.day.suggestions().get(orderId);
    if (suggestion?.status !== 'suggested') {
      return Promise.resolve(false);
    }
    return this.write(
      () =>
        this.rounds.assign(suggestion.roundId, {
          orderId,
          version: suggestion.roundVersion,
          after: suggestion.after,
        }),
      'La commande n’a pas pu être placée.',
    );
  }

  openRound(vehicleId: string): Promise<boolean> {
    return this.write(
      () => this.rounds.open({ day: this.day.day(), vehicleId }),
      'La tournée n’a pas pu être ouverte.',
    );
  }

  /** Affecter un livreur (MT-D2) ; une tournée partie est refusée par le serveur, qui le dit. */
  assignDriver(key: string, staffUserId: string): Promise<boolean> {
    const round = this.day.roundById(key)?.round;
    if (round === undefined) {
      return Promise.resolve(false);
    }
    return this.write(
      () => this.rounds.assignDriver(round.id, { staffUserId, version: round.version }),
      'Le livreur n’a pas pu être affecté.',
    );
  }

  unassignDriver(key: string): Promise<boolean> {
    const round = this.day.roundById(key)?.round;
    if (round === undefined) {
      return Promise.resolve(false);
    }
    return this.write(
      () => this.rounds.unassignDriver(round.id, { version: round.version }),
      'Le livreur n’a pas pu être retiré.',
    );
  }

  /** « Déclarer rentrée » (PL2) — quand le livreur a oublié, ou qu'aucun n'était affecté. */
  returnToDepot(key: string): Promise<boolean> {
    return this.write(
      () => this.rounds.returnToDepot(key),
      'La tournée n’a pas pu être déclarée rentrée.',
    );
  }
}
