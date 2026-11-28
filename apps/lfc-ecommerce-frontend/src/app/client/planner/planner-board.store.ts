import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { FulfillmentWindow, PlannerView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { OrderContextStore } from '../order-context.store';
import { firstQuantityOf } from '../shop/sale-unit';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientPlanner } from './client-planner.service';
import {
  cellKey,
  cellOfColumn,
  columnsOf,
  distinctWindows,
  emptyCell,
  placeOfKey,
  plannerRoutingOf,
  quotePayload,
  routingOfView,
  withQuantity,
  type PlannerCell,
  type PlannerRouting,
} from './planner-grid';

/** Le total d'une case : en centimes HT, en cours, ou indisponible. */
export type CellTotal = number | 'pending' | 'failed';

/** Ce qu'on glisse : un article, et la case d'où il vient (`null` : des favoris). */
export interface PlannerDrag {
  readonly sku: string;
  readonly from: string | null;
}

export type PlannerStatus = 'loading' | 'failed' | 'ready';

/** L'attente qui regroupe les gestes avant d'écrire (§ 6.1) : pas une écriture par clic. */
export const WRITE_DELAY_MS = 800;

/**
 * **L'état de la grille du planificateur** (plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * § 6.1) — fourni par la page, une instance par visite.
 *
 * Chaque geste change la case tout de suite, et la marque à écrire. Après une
 * courte attente, chaque case modifiée part entière (`PUT`, avec sa version),
 * ouverte d'abord si rien n'était enregistré ; puis la vue se relit — la
 * vérification du serveur suit chaque écriture — et seules les cases écrites
 * redemandent leur devis. Un 409 (gel, ou version dépassée par un autre
 * onglet) relit tout : ce que le serveur tient fait foi.
 */
@Injectable()
export class PlannerBoard {
  private readonly planner = inject(ClientPlanner);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly context = inject(OrderContextStore);

  readonly from = signal('');
  readonly status = signal<PlannerStatus>('loading');
  readonly view = signal<PlannerView | null>(null);
  readonly cells = signal<ReadonlyMap<string, PlannerCell>>(new Map());
  readonly totals = signal<ReadonlyMap<string, CellTotal>>(new Map());
  readonly writeError = signal<string | null>(null);
  /** Vrai après un 409 : la grille a été relue, et l'écran le dit. */
  readonly reloadedAfterConflict = signal(false);
  readonly dragging = signal<PlannerDrag | null>(null);

  private readonly extraDays = signal<readonly string[]>([]);
  private readonly extraWindows = signal<readonly FulfillmentWindow[]>([]);
  private readonly dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = 0;

  /**
   * L'acheminement : celui des colonnes enregistrées, sinon le mode de service
   * choisi dans la boutique. `null` : rien n'est choisi, rien ne s'ouvre.
   */
  readonly routing = computed<PlannerRouting | null>(() => {
    const view = this.view();
    return plannerRoutingOf(view === null ? null : routingOfView(view), this.context.choice());
  });

  /** Les jours affichés : ceux du serveur, puis ceux ajoutés par « ＋ ». */
  readonly days = computed<readonly string[]>(() => {
    const served = this.view()?.shownDays ?? [];
    return [...new Set([...served, ...this.extraDays()])].sort();
  });

  /** Les rangées : les créneaux enregistrés, celui du choix, et ceux ajoutés. */
  readonly windows = computed<readonly FulfillmentWindow[]>(() => {
    const saved = [...this.cells().values()].map((cell) => cell.window);
    const chosen = this.context.choice()?.window ?? null;
    return distinctWindows([
      ...saved,
      ...(chosen === null ? [] : [chosen]),
      ...this.extraWindows(),
    ]);
  });

  readonly favorites = computed<readonly string[]>(() => this.view()?.favorites ?? []);
  readonly checks = computed(() => this.view()?.checks ?? []);
  readonly lastPlannableDay = computed(() => this.view()?.lastPlannableDay ?? null);

  cellAt(day: string, window: FulfillmentWindow): PlannerCell {
    return this.cells().get(cellKey(day, window)) ?? emptyCell(day, window);
  }

  async load(from: string): Promise<void> {
    if (from !== this.from()) {
      this.extraDays.set([]);
    }
    this.from.set(from);
    this.status.set(this.view() === null ? 'loading' : this.status());
    try {
      const view = await this.planner.read(from);
      this.receive(view);
      this.status.set('ready');
      void this.quote([...this.cells().keys()]);
    } catch {
      this.status.set(this.view() === null ? 'failed' : 'ready');
    }
  }

  addDay(day: string): void {
    this.extraDays.update((days) => [...days, day]);
  }

  addWindow(window: FulfillmentWindow): void {
    this.extraWindows.update((windows) => [...windows, window]);
  }

  /** Copie un favori dans une case, à sa première quantité (le minimum de l'article). */
  add(sku: string, key: string): void {
    const item = this.catalogue.itemOf(sku);
    const first = item === null ? 1 : firstQuantityOf(item);
    if (first === null) {
      return;
    }
    this.edit(key, (lines) => {
      const current = lines.find((line) => line.sku === sku)?.quantity ?? 0;
      return withQuantity(lines, sku, current + first);
    });
  }

  /** Déplace une ligne d'une case à l'autre ; la quantité s'ajoute à celle déjà là. */
  move(sku: string, from: string, to: string): void {
    if (from === to) {
      return;
    }
    const moved =
      this.cells()
        .get(from)
        ?.lines.find((line) => line.sku === sku)?.quantity ?? 0;
    if (moved === 0) {
      return;
    }
    this.edit(from, (lines) => withQuantity(lines, sku, 0));
    this.edit(to, (lines) => {
      const current = lines.find((line) => line.sku === sku)?.quantity ?? 0;
      return withQuantity(lines, sku, current + moved);
    });
  }

  setQuantity(key: string, sku: string, quantity: number): void {
    this.edit(key, (lines) => withQuantity(lines, sku, quantity));
  }

  /**
   * Écrit tout de suite ce qui attend — à la sortie de la page, ou quand
   * l'onglet se cache ou se ferme (`keepalive` : la requête survit à la page).
   */
  flushNow(keepalive = false): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.flush(keepalive);
  }

  /** Un geste n'est pas encore enregistré : en attente, ou en route. */
  hasUnsavedWrites(): boolean {
    return this.dirty.size > 0 || this.inFlight > 0;
  }

  private edit(key: string, change: (lines: PlannerCell['lines']) => PlannerCell['lines']): void {
    const place = placeOfKey(key);
    const cell = this.cells().get(key) ?? emptyCell(place.day, place.window);
    const next = new Map(this.cells());
    next.set(key, { ...cell, lines: change(cell.lines) });
    this.cells.set(next);
    this.dirty.add(key);
    this.writeError.set(null);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, WRITE_DELAY_MS);
  }

  private async flush(keepalive = false): Promise<void> {
    const keys = [...this.dirty];
    this.dirty.clear();
    if (keys.length === 0) {
      return;
    }
    let conflict = false;
    this.inFlight += 1;
    try {
      for (const key of keys) {
        try {
          await this.writeCell(key, keepalive);
        } catch (error) {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            conflict = true;
          } else {
            this.writeError.set(httpErrorMessage(error));
          }
        }
      }
    } finally {
      this.inFlight -= 1;
    }
    this.reloadedAfterConflict.set(conflict);
    await this.refresh();
    void this.quote(keys);
  }

  private async writeCell(key: string, keepalive: boolean): Promise<void> {
    const cell = this.cells().get(key);
    const routing = this.routing();
    if (cell === undefined || routing === null) {
      return;
    }
    const full = { ...routing, window: cell.window };
    let columnId = cell.columnId;
    let version = cell.version;
    if (columnId === null || version === null) {
      if (cell.lines.length === 0) {
        return;
      }
      const opened = await this.planner.open({ day: cell.day, routing: full }, keepalive);
      columnId = opened.id;
      version = opened.version;
    }
    const written = await this.planner.write(
      columnId,
      {
        version,
        routing: full,
        lines: cell.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
      keepalive,
    );
    const latest = this.cells().get(key) ?? cell;
    const next = new Map(this.cells());
    next.set(key, { ...latest, columnId, version: written.version });
    this.cells.set(next);
  }

  /** Relit la vue sans toucher aux cases modifiées depuis. */
  private async refresh(): Promise<void> {
    try {
      this.receive(await this.planner.read(this.from()));
    } catch {
      // La grille affichée reste : la prochaine écriture relira.
    }
  }

  private receive(view: PlannerView): void {
    this.view.set(view);
    const next = new Map<string, PlannerCell>();
    for (const column of columnsOf(view)) {
      const cell = cellOfColumn(column);
      next.set(cell.key, cell);
    }
    for (const key of this.dirty) {
      const pending = this.cells().get(key);
      if (pending !== undefined) {
        next.set(key, pending);
      }
    }
    this.cells.set(next);
  }

  /** Le devis des cases données, une requête par case (§ 4, coût de l'écran). */
  private async quote(keys: readonly string[]): Promise<void> {
    const routing = this.routing();
    await Promise.all(
      keys.map(async (key) => {
        const cell = this.cells().get(key);
        if (cell === undefined) {
          return;
        }
        if (cell.lines.length === 0 || routing === null) {
          this.setTotal(key, 0);
          return;
        }
        this.setTotal(key, 'pending');
        try {
          this.setTotal(key, await this.planner.quote(quotePayload(cell, routing)));
        } catch {
          this.setTotal(key, 'failed');
        }
      }),
    );
  }

  private setTotal(key: string, total: CellTotal): void {
    const next = new Map(this.totals());
    next.set(key, total);
    this.totals.set(next);
  }
}
