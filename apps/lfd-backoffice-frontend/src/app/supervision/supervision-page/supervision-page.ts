import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import type {
  DaySupervisionView,
  HandoverQueueView,
  ProductionPackingView,
  ProductionWorksheetView,
} from '@lfd/contracts';
import type { FulfillmentMethod } from '@lfd/contracts';
import { ActivatedRoute, Router } from '@angular/router';
import type { FoldViewNavItem, FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
  FoldViewNavComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { dayLabelOf } from '../../production/worksheet-day';
import { refreshWhileVisible } from '../../shared/periodic-refresh';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { afterFailure, type ColumnState, dataOf, FAILED, LOADING, ready } from '../column-state';
import { handoverBoard } from '../handover-slots';
import { HandoverColumn } from '../handover-column/handover-column';
import { packingBoard } from '../packing-cards';
import { PackingColumn } from '../packing-column/packing-column';
import { preparationBoard } from '../preparation-shelves';
import { PreparationColumn } from '../preparation-column/preparation-column';
import { SupervisionColumn } from '../supervision-column/supervision-column';
import { asOfLabel } from '../supervision-labels';
import {
  landingColumnOf,
  LINK_PERMISSION,
  type SupervisionColumn as Column,
} from '../supervision-links';
import { SupervisionService } from '../supervision.service';
import { serviceDayParam, shiftServiceDay } from '../supervision-day';
import { blockersOf, countersOf, methodOptionsOf, supervisionTabs } from '../supervision-tabs';
import { supervisionMatches } from '../supervision-search';

/**
 * En dessous, une colonne à la fois (plan §6). 900 px et non le seuil commun
 * de 640 : trois colonnes de cartes ne tiennent pas lisiblement sur une
 * tablette en portrait — c'est le pli des dialogues de la boutique.
 */
const BOARD_NARROW = '(max-width: 900px)';

/**
 * **La Supervision du jour** — on voit, on n'agit pas (plan
 * `documentation/order/plan-supervision-du-jour.md`).
 *
 * Trois colonnes dont l'unité change — le rayon, la commande, le créneau —,
 * chacune servie par sa propre lecture sous `b2b_supervision:read`, avec son
 * propre état : une lecture qui échoue n'efface pas les autres. Le jour est
 * celui du SERVEUR : `supervision/day` sans date le donne, puis les trois
 * colonnes le lisent.
 *
 * On peut regarder un AUTRE jour (Hugo, 2026-09-28 : « il faudrait que je
 * puisse naviguer dans les dates ») — la veille pour relire, le lendemain pour
 * voir ce qui se prépare. Le jour choisi vit dans l'adresse (`?date=`) ;
 * sans lui, l'écran suit le jour du serveur, minuit compris.
 */
@Component({
  selector: 'app-supervision-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    FoldViewNavComponent,
    FoldViewToggleComponent,
    HandoverColumn,
    PackingColumn,
    PreparationColumn,
    SupervisionColumn,
  ],
  templateUrl: './supervision-page.html',
  styleUrl: './supervision-page.scss',
})
export class SupervisionPage {
  private readonly service = inject(SupervisionService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);

  /** Le jour choisi à l'écran, ou `null` : on suit le jour du serveur. */
  protected readonly chosen = signal(
    serviceDayParam(inject(ActivatedRoute).snapshot.queryParamMap.get('date')),
  );

  protected readonly narrow = narrowViewport(BOARD_NARROW);
  /** Le jour supervisé, appris du serveur. `null` tant qu'il ne l'a pas dit. */
  private readonly date = signal<string | null>(null);

  protected readonly day = signal<ColumnState<DaySupervisionView>>(LOADING);
  protected readonly preparation = signal<ColumnState<ProductionWorksheetView>>(LOADING);
  protected readonly packing = signal<ColumnState<ProductionPackingView>>(LOADING);
  protected readonly handover = signal<ColumnState<HandoverQueueView>>(LOADING);

  /** Le rôle choisit l'onglet d'arrivée ; le dernier ouvert ne l'emporte pas. */
  protected readonly tab = signal<Column>(
    landingColumnOf(this.permissions.identity()?.role ?? null),
  );

  /** Lu à chaque rendu : un droit accordé en cours de session ouvre les renvois. */
  protected readonly showLinks = computed(() => this.permissions.can(LINK_PERMISSION));

  protected readonly preparationBoard = computed(() => {
    const view = dataOf(this.preparation());
    return view === null ? null : preparationBoard(view);
  });

  protected readonly packingBoard = computed(() => {
    const view = dataOf(this.packing());
    return view === null ? null : packingBoard(view, dataOf(this.handover()));
  });

  protected readonly handoverBoard = computed(() => {
    const queue = dataOf(this.handover());
    return queue === null ? null : handoverBoard(queue, dataOf(this.day()));
  });

  protected readonly latenessUnknown = computed(() => {
    const day = this.day();
    return day.status !== 'ready' || day.stale;
  });

  /** « jeudi 25 septembre · à jour à 9 h 42 ». */
  protected readonly stamp = computed(() => {
    const day = dataOf(this.day());
    return day === null ? '' : `${dayLabelOf(day.date)} · ${asOfLabel(day.asOf)}`;
  });

  protected readonly counters = computed(() =>
    countersOf(this.preparationBoard(), this.packingBoard(), this.handoverBoard()),
  );

  /** La recherche du masthead : elle SURLIGNE dans les trois colonnes, elle ne filtre pas. */
  protected readonly query = signal('');
  protected readonly matches = computed(() =>
    supervisionMatches(this.query(), dataOf(this.handover()), dataOf(this.packing())),
  );

  /**
   * Les blocages que porte une carte du masthead — dits par une pastille
   * d'état, jamais par la couleur seule : les commandes qui attendent le four
   * (sur Préparation, la colonne qui bloque) et les créneaux dépassés.
   */
  protected readonly blockers = computed(() =>
    blockersOf(this.packingBoard()?.awaitingOven ?? 0, this.handoverBoard()?.overdue ?? 0),
  );

  /** Les onglets du mobile : le blocage d'une colonne voisine revient en pastille. */
  protected readonly tabs = computed<readonly FoldViewNavItem[]>(() =>
    supervisionTabs(
      this.counters(),
      this.packingBoard()?.awaitingOven ?? 0,
      this.handoverBoard()?.overdue ?? 0,
    ),
  );

  /** L'acheminement lu en colonne 3 : le segmenté vit dans l'en-tête fixe de la colonne. */
  protected readonly handoverMethod = signal<FulfillmentMethod>('pickup');

  protected readonly methodOptions = computed<readonly FoldViewToggleOption[]>(() =>
    methodOptionsOf(this.handoverBoard()),
  );

  constructor() {
    void this.load();
    refreshWhileVisible(() => this.refresh());
  }

  protected selectMethod(value: string): void {
    this.handoverMethod.set(value === 'delivery' ? 'delivery' : 'pickup');
  }

  protected selectTab(key: string): void {
    if (key === 'preparation' || key === 'packing' || key === 'handover') {
      this.tab.set(key);
    }
  }

  /** Tout relire depuis le jour du serveur — le premier chargement, ou quand il a échoué. */
  protected async load(): Promise<void> {
    for (const column of [this.day, this.preparation, this.packing, this.handover]) {
      column.set(LOADING);
    }
    let day: DaySupervisionView;
    try {
      day = await this.service.day(this.chosen() ?? undefined);
    } catch {
      // Sans le jour du serveur, aucune colonne ne sait quoi lire.
      for (const column of [this.day, this.preparation, this.packing, this.handover]) {
        column.set(FAILED);
      }
      return;
    }
    this.day.set(ready(day));
    this.date.set(day.date);
    await this.readColumns(day.date);
  }

  /** Le jour d'avant ou d'après celui qu'on regarde. */
  protected shift(days: number): void {
    const date = this.date();
    if (date !== null) {
      this.goTo(shiftServiceDay(date, days));
    }
  }

  /** `null` = revenir au jour du serveur, et le suivre de nouveau. */
  protected goTo(date: string | null): void {
    this.chosen.set(date);
    void this.router.navigate([], { queryParams: { date }, replaceUrl: true });
    void this.load();
  }

  /** Réessayer UNE colonne ; sans jour connu, c'est tout l'écran qu'il faut relire. */
  protected async retry(column: Column): Promise<void> {
    const date = this.date();
    if (date === null) {
      return this.load();
    }
    await this.readColumn(column, date, true);
  }

  /** La relecture périodique : elle ne vide jamais une colonne, elle dit qu'elle a échoué. */
  private async refresh(): Promise<void> {
    if (this.date() === null) {
      return;
    }
    try {
      const day = await this.service.day(this.chosen() ?? undefined);
      this.day.set(ready(day));
      // Minuit est passé au serveur : l'écran le suit, s'il n'a pas choisi.
      this.date.set(day.date);
    } catch {
      this.day.update(afterFailure);
    }
    const date = this.date();
    if (date !== null) {
      await this.readColumns(date);
    }
  }

  private async readColumns(date: string): Promise<void> {
    await Promise.all([
      this.readColumn('preparation', date),
      this.readColumn('packing', date),
      this.readColumn('handover', date),
    ]);
  }

  private readColumn(column: Column, date: string, reset = false): Promise<void> {
    switch (column) {
      case 'preparation':
        return this.readInto(this.preparation, () => this.service.preparation(date), date, reset);
      case 'packing':
        return this.readInto(this.packing, () => this.service.packing(date), date, reset);
      case 'handover':
        return this.readInto(this.handover, () => this.service.handover(date), date, reset);
    }
  }

  private async readInto<T>(
    target: WritableSignal<ColumnState<T>>,
    read: () => Promise<T>,
    date: string,
    reset: boolean,
  ): Promise<void> {
    if (reset) {
      target.set(LOADING);
    }
    try {
      const data = await read();
      // Le jour a pu changer pendant la lecture : on ne pose pas hier sur aujourd'hui.
      if (date === this.date()) {
        target.set(ready(data));
      }
    } catch {
      target.update(afterFailure);
    }
  }
}
