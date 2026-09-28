import { signal } from '@angular/core';
import type {
  DaySupervisionView,
  HandoverQueueView,
  ProductionPackingView,
  ProductionWorksheetView,
} from '@lfd/contracts';

import { afterFailure, type ColumnState, FAILED, LOADING, readInto, ready } from './column-state';
import type { QualityBoardStore } from './quality-board.store';
import { serverDayOf } from './supervision-day';
import type { SupervisionColumn as Column } from './supervision-links';
import type { SupervisionService } from './supervision.service';

/**
 * **Les quatre lectures de la Supervision et leurs états** — le jour, puis les
 * trois colonnes, chacune avec le sien : une lecture qui échoue n'efface pas
 * les autres (plan §9). Sorties de la page pour la garder sous les 300 lignes.
 *
 * Le jour est celui du SERVEUR : `supervision/day` sans date le donne, puis
 * les trois colonnes le lisent. `chosen` est le jour choisi à l'écran, `null`
 * pour suivre le serveur, minuit compris.
 */
export class SupervisionReads {
  /** Le jour supervisé, appris du serveur. `null` tant qu'il ne l'a pas dit. */
  readonly date = signal<string | null>(null);
  /** Le jour du SERVEUR — l'origine d'Hier / Aujourd'hui / Demain. */
  readonly serverDay = signal<string | null>(null);

  readonly day = signal<ColumnState<DaySupervisionView>>(LOADING);
  readonly preparation = signal<ColumnState<ProductionWorksheetView>>(LOADING);
  readonly packing = signal<ColumnState<ProductionPackingView>>(LOADING);
  readonly handover = signal<ColumnState<HandoverQueueView>>(LOADING);

  constructor(
    private readonly service: SupervisionService,
    private readonly quality: QualityBoardStore,
    private readonly chosen: () => string | null,
  ) {}

  /** Tout relire depuis le jour du serveur — le premier chargement, ou quand il a échoué. */
  async load(): Promise<void> {
    const all = [this.day, this.preparation, this.packing, this.handover];
    all.forEach((column) => column.set(LOADING));
    this.quality.reset();
    let day: DaySupervisionView;
    try {
      day = await this.service.day(this.chosen() ?? undefined);
    } catch {
      // Sans le jour du serveur, aucune colonne ne sait quoi lire.
      all.forEach((column) => column.set(FAILED));
      return;
    }
    this.learn(day);
    await this.readColumns(day.date);
  }

  /**
   * La relecture périodique : elle ne vide jamais une colonne, elle dit
   * qu'elle a échoué. `on-turn` : le jour seul, et les colonnes seulement si
   * minuit l'a fait tourner.
   */
  async refresh(columns: 'always' | 'on-turn' = 'always'): Promise<void> {
    const before = this.date();
    if (before === null) {
      return;
    }
    try {
      this.learn(await this.service.day(this.chosen() ?? undefined));
    } catch {
      this.day.update(afterFailure);
    }
    const date = this.date();
    if (date !== null && (columns === 'always' || date !== before)) {
      await this.readColumns(date);
    }
  }

  /** Réessayer UNE colonne ; sans jour connu, c'est tout l'écran qu'il faut relire. */
  async retry(column: Column): Promise<void> {
    const date = this.date();
    if (date === null) {
      return this.load();
    }
    await this.readColumn(column, date, true);
  }

  private learn(day: DaySupervisionView): void {
    this.day.set(ready(day));
    // Minuit est passé au serveur : l'écran le suit, s'il n'a pas choisi.
    this.date.set(day.date);
    this.serverDay.set(serverDayOf(day, this.chosen()));
  }

  private async readColumns(date: string): Promise<void> {
    await Promise.all([
      this.readColumn('preparation', date),
      this.readColumn('packing', date),
      this.readColumn('handover', date),
      this.quality.read(date),
    ]);
  }

  private readColumn(column: Column, date: string, reset = false): Promise<void> {
    // Le jour a pu changer pendant la lecture : on ne pose pas hier sur aujourd'hui.
    const current = (): boolean => date === this.date();
    switch (column) {
      case 'preparation':
        return readInto(this.preparation, () => this.service.preparation(date), current, reset);
      case 'packing':
        return readInto(this.packing, () => this.service.packing(date), current, reset);
      case 'handover':
        return readInto(this.handover, () => this.service.handover(date), current, reset);
    }
  }
}
